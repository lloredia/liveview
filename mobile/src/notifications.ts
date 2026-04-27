import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { registerDevice, registerIosPushToken } from "./api";

const DEVICE_ID_KEY = "lv.device_id.v1";

/**
 * Register a device record with the backend and cache the returned device_id.
 * Runs on simulator + real device. Returns the device_id, or null if the
 * registration call failed (network etc).
 *
 * This is safe to call repeatedly — backend dedupes by device_id, and we
 * pass the cached id back so the row is reused.
 */
export async function ensureDeviceRegistered(): Promise<string | null> {
  try {
    const cached = await AsyncStorage.getItem(DEVICE_ID_KEY);
    const platform = Platform.OS === "ios" ? "ios" : "web";
    const deviceId = await registerDevice(platform, undefined, cached ?? undefined);
    if (deviceId !== cached) await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    return deviceId;
  } catch {
    return null;
  }
}

/**
 * iOS APNs registration. Resolves true when the device has been registered
 * AND the APNs token is forwarded to the backend. Resolves false when:
 *   - running on a simulator (no APNs)
 *   - permission denied
 *   - any network error (we don't want notification setup to block the UI)
 *
 * Always registers the device record first so the device_id is available
 * for game-tracking calls even on simulator.
 */
export async function registerForPushNotifications(): Promise<boolean> {
  await ensureDeviceRegistered();
  if (Platform.OS !== "ios") return false;
  if (!Device.isDevice) return false;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return false;

    const tokenResp = await Notifications.getDevicePushTokenAsync();
    const apnsToken = tokenResp.data;
    if (!apnsToken || typeof apnsToken !== "string") return false;

    const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) return false;

    const bundleId =
      (Constants.expoConfig?.ios?.bundleIdentifier as string | undefined) ??
      "com.lloredia.liveview";
    await registerIosPushToken(deviceId, apnsToken, bundleId);
    return true;
  } catch {
    return false;
  }
}

export async function getDeviceId(): Promise<string | null> {
  return AsyncStorage.getItem(DEVICE_ID_KEY);
}

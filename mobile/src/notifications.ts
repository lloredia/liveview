import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { registerDevice, registerIosPushToken } from "./api";

const DEVICE_ID_KEY = "lv.device_id.v1";

/**
 * iOS APNs registration. Resolves true when the device has been registered
 * with the backend and the APNs token is forwarded. Resolves false when:
 *   - running on a simulator (no APNs)
 *   - permission denied
 *   - any network error (we don't want notification setup to block the UI)
 *
 * Safe to call multiple times — backend dedupes by device_id and apns_token.
 */
export async function registerForPushNotifications(): Promise<boolean> {
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

    const cached = await AsyncStorage.getItem(DEVICE_ID_KEY);
    const deviceId = await registerDevice("ios", undefined, cached ?? undefined);
    if (deviceId !== cached) await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);

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

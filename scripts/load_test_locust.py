"""
Basic Locust load test for Live View API.

Prereq: pip install locust

Run:
  locust -f scripts/load_test_locust.py --host=http://localhost:8000
  locust -f scripts/load_test_locust.py --host=http://localhost:8000 --users 50 --spawn-rate 5 --run-time 1m
"""
from locust import HttpUser, task, between


class LiveViewUser(HttpUser):
    wait_time = between(0.5, 1.5)

    def on_start(self):
        r = self.client.get("/health")
        if r.status_code != 200:
            raise Exception("Health check failed")

    @task(3)
    def health(self):
        self.client.get("/health")

    @task(2)
    def ready(self):
        self.client.get("/ready")

    @task(5)
    def leagues(self):
        self.client.get("/v1/leagues")

    @task(2)
    def today(self):
        self.client.get("/v1/today")

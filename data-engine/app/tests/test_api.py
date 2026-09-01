from fastapi.testclient import TestClient
from app.api.main import app

client = TestClient(app)

def test_health(): assert client.get("/health").json()["status"] == "ok"
def test_profile_and_structured_error():
    response = client.post("/profile", files={"file": ("sample.csv", b"id\n1\n2\n", "text/csv")})
    assert response.status_code == 200 and response.json()["profiler_version"]
    response = client.post("/profile", files={"file": ("sample.txt", b"id\n1", "text/plain")})
    assert response.status_code == 422 and response.json()["error"]["code"] == "unsupported_input"

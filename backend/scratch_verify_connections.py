import argparse
import json

import httpx


def print_result(name: str, ok: bool, status: str, detail: str = "") -> None:
    badge = "PASS" if ok else "FAIL"
    line = f"[{badge}] {name}: {status}"
    if detail:
        line += f" | {detail}"
    print(line)


def summarize_json(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        text = response.text.strip()
        return text[:200]

    if isinstance(data, dict):
        keys = ", ".join(sorted(data.keys()))
        return f"json keys: {keys}"
    if isinstance(data, list):
        return f"json list length: {len(data)}"
    return json.dumps(data)[:200]


def safe_request(client: httpx.Client, method: str, url: str, **kwargs) -> tuple[bool, str, str]:
    try:
        response = client.request(method, url, **kwargs)
    except httpx.HTTPError as exc:
        return False, "error", str(exc)

    return True, str(response.status_code), summarize_json(response)


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify local frontend/backend connection points.")
    parser.add_argument("--base-url", default="http://127.0.0.1:9001", help="Backend origin to verify.")
    parser.add_argument("--origin", default="http://localhost:5173", help="Frontend origin for CORS checks.")
    parser.add_argument("--email", help="Optional email for forgot-password/login checks.")
    parser.add_argument("--password", help="Optional password for login check.")
    args = parser.parse_args()

    checks_failed = 0

    with httpx.Client(base_url=args.base_url, timeout=10.0) as client:
        ok, status, detail = safe_request(client, "GET", "/health")
        ok = ok and status == "200"
        print_result("health", ok, status, detail)
        checks_failed += 0 if ok else 1

        try:
            preflight = client.options(
                "/api/v1/auth/voter/login",
                headers={
                    "Origin": args.origin,
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type",
                },
            )
            allow_origin = preflight.headers.get("access-control-allow-origin")
            ok = preflight.status_code == 200 and allow_origin == args.origin
            status = str(preflight.status_code)
            detail = f"allow-origin={allow_origin}"
        except httpx.HTTPError as exc:
            ok = False
            status = "error"
            detail = str(exc)
        print_result("cors_preflight", ok, status, detail)
        checks_failed += 0 if ok else 1

        ok, status, detail = safe_request(client, "GET", "/api/v1/candidates/positions")
        ok = ok and status == "200"
        print_result("positions", ok, status, detail)
        checks_failed += 0 if ok else 1

        ok, status, detail = safe_request(client, "GET", "/api/v1/candidates/")
        ok = ok and status == "200"
        print_result("candidates", ok, status, detail)
        checks_failed += 0 if ok else 1

        if args.email:
            ok, status, detail = safe_request(
                client,
                "POST",
                "/api/v1/auth/forgot-password/request",
                json={"email": args.email},
            )
            ok = ok and status not in {"500", "502", "503", "504"}
            print_result("forgot_password", ok, status, detail)
            checks_failed += 0 if ok else 1

        if args.email and args.password:
            ok, status, detail = safe_request(
                client,
                "POST",
                "/api/v1/auth/voter/login",
                json={"email": args.email, "password": args.password},
                headers={"Origin": args.origin},
            )
            ok = ok and status not in {"500", "502", "503", "504"}
            print_result("voter_login", ok, status, detail)
            checks_failed += 0 if ok else 1

    return 1 if checks_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

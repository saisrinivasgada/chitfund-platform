#!/usr/bin/env python3
"""Fail CI when a production Logback encoder uses unsupported nesting."""

from pathlib import Path
import sys
import xml.etree.ElementTree as ET


errors: list[str] = []
configs = sorted(Path(".").glob("chitfund-*/src/main/resources/logback-spring.xml"))

for config in configs:
    try:
        root = ET.parse(config).getroot()
    except ET.ParseError as exc:
        errors.append(f"{config}: invalid XML: {exc}")
        continue

    for encoder in root.iter("encoder"):
        if encoder.get("class") != "net.logstash.logback.encoder.LogstashEncoder":
            continue
        if encoder.find("providers") is not None:
            errors.append(
                f"{config}: LogstashEncoder rejects <providers>; use its built-in "
                "providers or select a composite encoder"
            )

if not configs:
    errors.append("no production Logback configurations found")

if errors:
    print("Production configuration check failed:", file=sys.stderr)
    for error in errors:
        print(f"  - {error}", file=sys.stderr)
    raise SystemExit(1)

print(f"Production logging configuration: OK ({len(configs)} files)")

gateway_config = Path("chitfund-api-gateway/src/main/resources/application.yml").read_text()
required_gateway_origins = (
    '"https://thechitwise.com"',
    '"https://*.thechitwise.com"',
    '"https://chitwise.app"',
    '"https://*.chitwise.app"',
)
missing_origins = [origin for origin in required_gateway_origins if origin not in gateway_config]
if missing_origins:
    print(
        "Production gateway CORS check failed; missing: " + ", ".join(missing_origins),
        file=sys.stderr,
    )
    raise SystemExit(1)

print("Production gateway CORS configuration: OK")

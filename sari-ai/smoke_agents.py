"""Check the four deployed Ask AI routes without saving any store records."""
import argparse
import json
import sys
from urllib.error import URLError
from urllib.request import Request, urlopen


def ask(endpoint, question, agent="auto"):
    body = json.dumps({"agent": agent, "period": 7, "question": question}).encode()
    request = Request(endpoint, data=body, headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=90) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="SARI-AI app URL, such as https://your-app.onrender.com")
    args = parser.parse_args()
    endpoint = args.url.rstrip("/") + "/api/v1/ask"
    questions = {
        "recording": "Dagdag 24 na kape.",
        "insights": "Which product sold most?",
        "forecast": "What might run out tomorrow?",
        "health": "Check my records for missing costs and unusual counts.",
    }
    failed = False
    for agent, question in questions.items():
        try:
            reply = ask(endpoint, question)
            if reply.get("agent") != agent:
                raise ValueError("Wrong agent selected")
            if reply.get("source") != "external":
                raise ValueError("Local fallback: " + str(reply.get("reason", "unknown")))
            if not reply.get("text", "").strip():
                raise ValueError("Empty reply")
            if agent == "recording":
                draft = reply.get("draft", {})
                lines = draft.get("lines", [])
                if (draft.get("kind") != "stock" or draft.get("reason") != "restock"
                        or len(lines) != 1 or lines[0].get("quantity") != "24"
                        or lines[0].get("product_id") != "product-1"):
                    raise ValueError("Expected a 24-sachet coffee stock-in draft for the seeded demo")
            elif not reply.get("facts"):
                raise ValueError("Missing supporting store figures")
        except (URLError, OSError, ValueError) as error:
            print(f"{agent}: FAIL ({error})")
            failed = True
        else:
            print(f"{agent}: PASS (external response)")
        try:
            guide = ask(endpoint, "How do I record a repayment?", agent)
            if guide.get("source") != "guide" or guide.get("destination") != "ledger" or "draft" in guide:
                raise ValueError("Expected a link to Ledger and directions without a transaction draft")
        except (URLError, OSError, ValueError) as error:
            print(f"{agent}: FAIL (app guide: {error})")
            failed = True
        else:
            print(f"{agent}: PASS (app guide)")
    return int(failed)


if __name__ == "__main__":
    sys.exit(main())


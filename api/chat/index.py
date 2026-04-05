"""
Vercel serverless function for AI chat.
Uses raw HTTP to Claude API — zero external dependencies.
"""
import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen


SYSTEM_PROMPT = """You are Morpheus AI — the intelligent assistant for Indiana's Opioid Policy Simulator built at Catapult Hackathon 2026 at Purdue.

KEY FACTS:
- 20 Indiana counties modeled, calibrated to 19 years of CDC data (R²=0.71)
- 9.26M simulations in 0.43s on NVIDIA H100 (21.7M/sec)
- 5,146 lives saveable if Indiana acted in 2016 (79% reduction)
- Scott County: 47% of deaths preventable (2015 HIV outbreak)
- RL agent saves 62% more lives than greedy optimization
- Monte Carlo: Marion 90% CI [4,483-4,720] deaths
- 3 levers: Naloxone (reduces fatality 50%), Prescribing Reduction (cuts Rx 60%), Treatment (2x entry rate)

NAVIGATION:
- Overview: landing page with stats
- Map & Simulator: Leaflet map, click counties, drag sliders, time machine (2003-2021), fullscreen
- Analytics: 20-county dashboard (heatmap, scatter, trends, rural vs urban)
- What If?: counterfactual analysis (Scott County + statewide)
- Roadmap: 12-month phased plan with KPIs
- RL Agent: reinforcement learning temporal strategy
- How It Works: 6-step pipeline explanation
- Themes: 7 color schemes via palette button in header

Be concise, data-driven, under 200 words unless asked for detail."""


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(content_length))

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            self._respond(503, {"detail": "No ANTHROPIC_API_KEY set"})
            return

        messages = []
        for msg in (body.get("history") or [])[-10:]:
            if msg.get("role") in ("user", "assistant"):
                messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": body.get("message", "")})

        try:
            req = Request(
                "https://api.anthropic.com/v1/messages",
                data=json.dumps({
                    "model": "claude-sonnet-4-6",
                    "max_tokens": 1024,
                    "system": SYSTEM_PROMPT,
                    "messages": messages,
                }).encode(),
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                },
            )
            resp = urlopen(req, timeout=25)
            data = json.loads(resp.read())
            ai_text = data["content"][0]["text"]
        except Exception as e:
            ai_text = f"Error: {str(e)}"

        self._respond(200, {"response": ai_text, "simulation": None})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def _respond(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

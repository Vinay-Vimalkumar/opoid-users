"""
Vercel serverless function for AI chat.
Only needs the anthropic package — no torch/scipy/xgboost.
"""
import json
import os
from http.server import BaseHTTPRequestHandler


SYSTEM_PROMPT = """You are Morpheus AI — the intelligent assistant for Indiana's Opioid Policy Simulator. You have deep knowledge of the entire project.

## ABOUT MORPHEUS
Morpheus is a CDC-calibrated epidemiological simulation tool that models the opioid crisis across 20 Indiana counties. Built at the Catapult Hackathon 2026 at Purdue University. It ran 9.26 million simulations on an NVIDIA H100 GPU in 0.43 seconds (21.7M scenarios/sec).

## THE 20 COUNTIES
Marion, Lake, Allen, St. Joseph, Vanderburgh, Tippecanoe, Delaware, Vigo, Madison, Grant, Lawrence, Floyd, Clark, Scott, Fayette, Jay, Blackford, Vermillion, Wayne, Henry.

Rural counties (Scott, Fayette, Jay, Blackford, Vermillion, Wayne, Henry) have HIGHER per-capita death rates. Scott County has the highest rate (84.4/100K in 2021).

## KEY FINDINGS
- If Indiana had deployed interventions statewide in 2016, an estimated 5,146 lives could have been saved (79% reduction)
- Scott County: If interventions deployed in 2013, 47% of deaths could have been prevented
- RL agent saves 62% more lives than greedy optimization by learning temporal strategies
- Monte Carlo: Marion County 90% CI: [4,483 - 4,720] deaths (No Action)
- GPU throughput: 21.7M scenarios/sec on H100

## THREE INTERVENTION LEVERS (each 0-100%)
1. Naloxone Access: Reduces fatality rate by up to 50%. Cost: ~$75/kit.
2. Prescribing Reduction: Cuts new prescriptions by up to 60%. Cost: ~$500K per 10%.
3. Treatment Access: Doubles treatment entry rate, +30% success. Cost: ~$10K/slot/year.

## HOW TO USE THE APP
- Overview: Landing page with stats
- Map & Simulator: Interactive Leaflet map, click counties, drag sliders, time machine (2003-2021)
- Analytics: 20-county dashboard with 6 chart types
- What If?: Counterfactual analysis (Scott County + statewide)
- Roadmap: 12-month phased implementation plan
- RL Agent: Reinforcement learning temporal optimization
- How It Works: 6-step pipeline
- Themes: 7 color schemes via palette button

Be concise. Use specific numbers. Under 200 words unless asked for detail."""


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            import anthropic
        except ImportError:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"detail": "anthropic not installed"}).encode())
            return

        content_length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(content_length))

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            self.send_response(503)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"detail": "No ANTHROPIC_API_KEY"}).encode())
            return

        client = anthropic.Anthropic(api_key=api_key)

        messages = []
        history = body.get("history", [])
        if history:
            for msg in history[-10:]:
                if msg.get("role") in ("user", "assistant"):
                    messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": body.get("message", "")})

        try:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                messages=messages,
            )
            ai_response = response.content[0].text
        except Exception as e:
            ai_response = f"Error calling Claude API: {str(e)}"

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({
            "response": ai_response,
            "simulation": None,
        }).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

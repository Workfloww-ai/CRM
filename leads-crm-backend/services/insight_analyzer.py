import os
import json
import logging
from datetime import datetime, timezone
import httpx

logger = logging.getLogger(__name__)

OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"


def analyze_insight_for_action_item(
    insight_text: str,
    lead_name: str = "",
    org: str = "",
    current_date_str: str = None
) -> dict:
    """
    Analyzes an insight text using OpenAI (gpt-4o-mini) to detect and extract action items.
    Returns:
        dict: {
            "has_action_item": bool,
            "task": str or None,
            "due_date": str (YYYY-MM-DD) or None
        }
    """
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        logger.warning("OPENAI_API_KEY is not set in environment. Skipping AI action item extraction.")
        return {"has_action_item": False, "task": None, "due_date": None}

    if not current_date_str:
        current_date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    system_prompt = (
        "You are an executive CRM assistant that analyzes conversation insights from sales and business calls.\n"
        "Your task is to determine whether any action item, task, or follow-up needs to be completed based on the discussion.\n\n"
        f"Today's date is: {current_date_str}.\n"
        f"Lead contact: {lead_name or 'the lead'}.\n"
        f"Company / Organization: {org or 'the company'}.\n\n"
        "Guidelines:\n"
        "1. Identify if a specific task or follow-up was agreed upon, requested, or needed (e.g. send proposal, schedule demo, share pricing, follow up on WhatsApp/call).\n"
        "2. If an action item exists:\n"
        "   - 'has_action_item': true\n"
        "   - 'task': A concise, professional task description (e.g., 'Send updated commercial proposal and deck to John Doe').\n"
        f"   - 'due_date': Calculated target completion date in YYYY-MM-DD format based on reference date {current_date_str}. If a specific deadline was stated (e.g., 'by Friday', 'next week', 'tomorrow'), compute the exact date. If no specific deadline was mentioned, default to 3 days from {current_date_str}.\n"
        "3. If NO action item exists (e.g., purely informative note, pleasantries, general feedback with no next steps, or completely dead lead):\n"
        "   - 'has_action_item': false\n"
        "   - 'task': null\n"
        "   - 'due_date': null\n\n"
        "Return strictly a JSON object with keys: 'has_action_item', 'task', 'due_date'."
    )

    user_prompt = f"Call Insight to analyze:\n\"\"\"{insight_text}\"\"\""

    try:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
            "max_tokens": 300
        }

        with httpx.Client(timeout=15.0) as client:
            response = client.post(OPENAI_API_URL, headers=headers, json=payload)
            if response.status_code != 200:
                logger.error(f"OpenAI API error ({response.status_code}): {response.text}")
                return {"has_action_item": False, "task": None, "due_date": None}

            result = response.json()
            content = result["choices"][0]["message"]["content"]
            parsed = json.loads(content)

            has_action = bool(parsed.get("has_action_item"))
            task = parsed.get("task") if has_action else None
            due_date = parsed.get("due_date") if has_action else None

            # Validate due_date format YYYY-MM-DD
            if due_date:
                try:
                    datetime.strptime(due_date, "%Y-%m-%d")
                except ValueError:
                    due_date = None

            return {
                "has_action_item": has_action and bool(task),
                "task": task.strip() if task else None,
                "due_date": due_date
            }

    except Exception as e:
        logger.error(f"Exception during OpenAI action item extraction: {e}")
        return {"has_action_item": False, "task": None, "due_date": None}


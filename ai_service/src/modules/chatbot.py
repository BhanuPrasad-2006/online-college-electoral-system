from src.utils.gemini import call_gemini

SYSTEM_INSTRUCTION = (
    "You are an AI assistant designed to help college students with queries about the college election process. "
    "Under no circumstances should you endorse any candidate, show bias, compare candidates, or take political stances. "
    "Your responses must be strictly neutral and objective. If the user asks for candidate recommendations, "
    "opinionated political stances, or biased advice (e.g., 'who should I vote for?'), you must politely decline "
    "to answer and explain that your role is to provide objective information about the voting process, rules, "
    "schedules, and guidelines."
)

class ChatbotHelper:
    def ask(self, prompt: str) -> dict:
        """
        Sends the prompt to Gemini with political neutrality instructions.
        Returns a dictionary with 'response' and 'flagged_for_neutrality'.
        """
        prompt_lower = prompt.lower()
        flagged = False
        
        # Proactively check for neutrality violations in the prompt
        neutrality_violation_keywords = [
            "vote for", "recommend", "who is better", "should i vote", "who to vote", 
            "endorse", "best candidate", "worst candidate", "prefer candidate",
            "candidate a", "candidate b"
        ]
        
        if any(keyword in prompt_lower for keyword in neutrality_violation_keywords):
            flagged = True

        # Call Gemini with strict system instruction using gemini-2.5-flash
        response_text = call_gemini(
            prompt=prompt,
            system_instruction=SYSTEM_INSTRUCTION,
            model="gemini-2.5-flash"
        )
        
        # If the response itself indicates a neutrality refusal, ensure the flag is set
        refusal_indicators = [
            "cannot recommend", "cannot endorse", "neutral assistant", 
            "decline to", "politely decline", "political neutrality", "remain neutral"
        ]
        if any(indicator in response_text.lower() for indicator in refusal_indicators):
            flagged = True
            
        return {
            "response": response_text,
            "flagged_for_neutrality": flagged
        }

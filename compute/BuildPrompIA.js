function BuildPrompt(tr, locale, sum) {
    return `You're an osu! performance coach.
Based on the following player summary and recent scores, return a 4-line assessment, short and friendly, to be used in an IRC-like chat.
Each line must be concise (max ~80 characters), but contain:
constructive advice
motivational tone
possible weakness or strength
You must analyze everything well and give extreme precision on the suggestions and opinions
It is necessary to provide tips
You need specific suggestions and advice, no need to pamper the player
You must detect if a way of playing or game mods may not be favorable for progression
You have to be realistic and hide. Use the top rank well.
Target Mode: OSU/STANDARD

Respond in this exact JSON structure:

{
  "lines": [
    "Line 1 here",
    "Line 2 here",
    "Line 3 here",
    "Line 4 here"
  ]
}

Use natural language, as if you're talking to the player directly.
You ABSOLULY write all that in the ${locale} language
Player Data: ${JSON.stringify(sum)}
Top Ranks:${JSON.stringify(tr)}`
}
module.exports = BuildPrompt
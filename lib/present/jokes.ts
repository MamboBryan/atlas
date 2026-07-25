export const jokes: readonly string[] = [
  "I love virtual meetings. It's the only time I can maintain intense eye contact with my own forehead for an hour.",
  "My blurred background isn't for privacy; it's to protect you from the terrifying reality of my laundry pile.",
  "The best part of an online meeting is knowing that at least half the attendees are wearing pajama bottoms.",
  "\"You look frozen\" is either a major compliment about my anti-aging skincare routine or a warning about my Wi-Fi.",
  "I've developed a brand new micro-expression: the frantic facial adjustment I make the second I realize my camera has been on the whole time.",
  "My favorite extreme sport is trying to turn off my video right as I sneeze so nobody has to witness the aftermath.",
  "\"You're on mute\" has officially replaced \"Good morning\" as the standard corporate greeting.",
  "The adrenaline rush of trying to find the mute button while a dog barks in the background is unmatched.",
  "I spend half the meeting on mute talking to my coffee cup, and the other half unmuted breathing heavily into the microphone.",
  "The most absolute power I have ever felt in my life is being the meeting host and hitting \"Mute All.\"",
  "Shoutout to the brave soul who un-mutes just to laugh at the host's joke. You are the glue holding this team together.",
  "If you talk for more than 15 seconds on mute, the app shouldn't just notify you — it should automatically order you a stiff drink.",
  "Screen sharing is just a high-stakes digital trust fall with your coworkers.",
  "There is no sheer panic quite like trying to close 47 unrelated browser tabs right before you hit \"Share Screen.\"",
  "\"Can everyone see my screen?\" — Yes, we can, and we also see that your most recent Google search was \"how to fake a frozen screen.\"",
  "Let us all take a moment of silence for the brave people who accidentally share their entire desktop instead of just one specific window.",
  "Whenever I share my screen, I am fully aware that I am one rogue notification away from professional ruin.",
  "\"No, you go ahead,\" — \"No, you go,\" — \"Sorry, there's a delay,\" — A tragic three-act play performed in every single virtual meeting.",
  "My Wi-Fi only acts up when I'm about to make a brilliant, career-defining point. It is definitely a conspiracy.",
  "Typing \"Having connection issues, joining in a minute\" into the chat is the modern-day equivalent of saying \"traffic was terrible.\"",
  "Virtual meetings have basically turned us all into ghost hunters: \"Are you there? Can you hear us? Give us a sign if you can hear us.\"",
  "I put a piece of tape over my webcam so the FBI can't watch me absolutely zone out during these weekly updates.",
  "The red \"Leave Meeting\" button is arguably the most satisfying piece of user interface design in human history.",
  "Nothing says teamwork quite like four people simultaneously saying \"I think you're frozen\" to the manager.",
  "My favorite virtual meeting game is seeing who can wave the absolute most awkwardly right before the window closes.",
];

export function pickJoke(meetingId: string): string {
  let h = 0;
  for (let i = 0; i < meetingId.length; i++) {
    h = (h * 31 + meetingId.charCodeAt(i)) >>> 0;
  }
  return jokes[h % jokes.length];
}

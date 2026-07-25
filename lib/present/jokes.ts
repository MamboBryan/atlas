export const jokes: readonly string[] = [
  "Why did the standup cross the road? To get to the other sprint.",
  "I told my kanban board a joke. It moved to done without laughing.",
  "My meeting notes are like my dreams — mostly forgotten by lunch.",
  "The retro said we should meet less. So we scheduled a follow-up.",
  "I'm not procrastinating. I'm loading in the background.",
  "There are two hard things in software: cache invalidation, naming things, and off-by-one errors.",
  "A backlog walks into a bar. The bartender says, we'll get to you eventually.",
  "Deploy Friday? I prefer to live dangerously on a Tuesday.",
  "The best status update is the one you didn't have to write.",
  "I asked the CI what it thought. It's still thinking.",
  "Our sprint velocity is measured in enthusiastic sighs.",
  "Product said the roadmap is aspirational. So is my inbox.",
  "The meeting could have been a message. The message could have been silence.",
  "I have a great sense of urgency. It's usually about lunch.",
  "OKRs stand for: Obviously, Kinda, Roughly.",
  "The demo works on my machine, which is now on vacation.",
  "Two engineers walk into a room. They pair on the door.",
  "A well-scoped ticket is a myth. Handle with care.",
  "The scariest part of any meeting is 'quick question'.",
  "I love agile. Especially the part where the sprint ends.",
];

export function pickJoke(meetingId: string): string {
  let h = 0;
  for (let i = 0; i < meetingId.length; i++) {
    h = (h * 31 + meetingId.charCodeAt(i)) >>> 0;
  }
  return jokes[h % jokes.length];
}

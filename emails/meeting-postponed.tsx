import { Button, Heading, Text } from "@react-email/components";
import { Layout } from "./_layout";

export type MeetingPostponedProps = {
  meetingTitle: string;
  newWhen: string;
  reason: string;
  url: string;
};

export default function MeetingPostponed({
  meetingTitle,
  newWhen,
  reason,
  url,
}: MeetingPostponedProps) {
  return (
    <Layout preview={`${meetingTitle} postponed`}>
      <Heading style={{ fontSize: "20px" }}>
        {meetingTitle} was postponed
      </Heading>
      <Text>Now scheduled for {newWhen}.</Text>
      <Text style={{ color: "#666" }}>Reason: {reason}</Text>
      <Button
        href={url}
        style={{
          backgroundColor: "#111",
          color: "#fff",
          padding: "10px 16px",
          borderRadius: "6px",
        }}
      >
        Open new meeting
      </Button>
    </Layout>
  );
}

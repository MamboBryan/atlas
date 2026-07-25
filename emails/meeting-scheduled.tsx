import { Button, Heading, Text } from "@react-email/components";
import { Layout } from "./_layout";

export type MeetingScheduledProps = {
  meetingTitle: string;
  when: string;
  url: string;
};

export default function MeetingScheduled({
  meetingTitle,
  when,
  url,
}: MeetingScheduledProps) {
  return (
    <Layout preview={`${meetingTitle} scheduled`}>
      <Heading style={{ fontSize: "20px" }}>{meetingTitle} scheduled</Heading>
      <Text>Scheduled for {when}.</Text>
      <Button
        href={url}
        style={{
          backgroundColor: "#111",
          color: "#fff",
          padding: "10px 16px",
          borderRadius: "6px",
        }}
      >
        Open meeting
      </Button>
    </Layout>
  );
}

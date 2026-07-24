import { Button, Heading, Text } from "@react-email/components";
import { Layout } from "./_layout";

export type MeetingStartsSoonProps = {
  meetingTitle: string;
  when: string;
  url: string;
};

export default function MeetingStartsSoon({
  meetingTitle,
  when,
  url,
}: MeetingStartsSoonProps) {
  return (
    <Layout preview={`${meetingTitle} starts in 10 minutes`}>
      <Heading style={{ fontSize: "20px" }}>
        {meetingTitle} starts in 10 minutes
      </Heading>
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
        Open Atlas
      </Button>
    </Layout>
  );
}

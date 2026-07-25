import { Heading, Text } from "@react-email/components";
import { Layout } from "./_layout";

export type MeetingCancelledProps = {
  meetingTitle: string;
  when: string;
  reason: string;
};

export default function MeetingCancelled({
  meetingTitle,
  when,
  reason,
}: MeetingCancelledProps) {
  return (
    <Layout preview={`${meetingTitle} cancelled`}>
      <Heading style={{ fontSize: "20px" }}>
        {meetingTitle} was cancelled
      </Heading>
      <Text>It was scheduled for {when}.</Text>
      <Text style={{ color: "#666" }}>Reason: {reason}</Text>
    </Layout>
  );
}

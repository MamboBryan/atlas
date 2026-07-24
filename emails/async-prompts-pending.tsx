import { Button, Heading, Text } from "@react-email/components";
import { Layout } from "./_layout";

export type AsyncPromptsPendingProps = {
  meetingTitle: string;
  promptCount: number;
  dueBy: string;
  url: string;
};

export default function AsyncPromptsPending({
  meetingTitle,
  promptCount,
  dueBy,
  url,
}: AsyncPromptsPendingProps) {
  return (
    <Layout preview={`${promptCount} prompt(s) waiting for ${meetingTitle}`}>
      <Heading style={{ fontSize: "20px" }}>
        {promptCount} prompt{promptCount === 1 ? "" : "s"} waiting
      </Heading>
      <Text>
        Please respond before {meetingTitle} on {dueBy}.
      </Text>
      <Button
        href={url}
        style={{
          backgroundColor: "#111",
          color: "#fff",
          padding: "10px 16px",
          borderRadius: "6px",
        }}
      >
        Respond now
      </Button>
    </Layout>
  );
}

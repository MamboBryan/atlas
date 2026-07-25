import { Button, Heading, Text } from "@react-email/components";
import { Layout } from "./_layout";

export type PollCreatedProps = {
  pollTitle: string;
  createdBy: string;
  url: string;
};

export default function PollCreated({
  pollTitle,
  createdBy,
  url,
}: PollCreatedProps) {
  return (
    <Layout preview={`New poll: ${pollTitle}`}>
      <Heading style={{ fontSize: "20px" }}>New poll</Heading>
      <Text>
        <strong>{createdBy}</strong> opened “{pollTitle}”.
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
        Cast your vote
      </Button>
    </Layout>
  );
}

import { Button, Heading, Text } from "@react-email/components";
import { Layout } from "./_layout";

export type PollRevealedProps = {
  pollTitle: string;
  url: string;
};

export default function PollRevealed({ pollTitle, url }: PollRevealedProps) {
  return (
    <Layout preview={`Results are in: ${pollTitle}`}>
      <Heading style={{ fontSize: "20px" }}>Results are in</Heading>
      <Text>“{pollTitle}” results are now visible.</Text>
      <Button
        href={url}
        style={{
          backgroundColor: "#111",
          color: "#fff",
          padding: "10px 16px",
          borderRadius: "6px",
        }}
      >
        See results
      </Button>
    </Layout>
  );
}

import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

export function Layout({
  preview,
  children,
}: {
  preview: string;
  children: ReactNode;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://atlas.example";
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: "#f5f5f5",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            padding: "32px",
            maxWidth: "560px",
          }}
        >
          <Section>
            <Text
              style={{
                fontSize: "18px",
                fontWeight: 600,
                margin: 0,
                color: "#111",
              }}
            >
              Atlas
            </Text>
          </Section>
          <Section>{children}</Section>
          <Hr style={{ borderColor: "#eee", marginTop: "24px" }} />
          <Section>
            <Text style={{ fontSize: "12px", color: "#888" }}>
              <Link href={`${appUrl}/settings`} style={{ color: "#888" }}>
                Manage email preferences
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

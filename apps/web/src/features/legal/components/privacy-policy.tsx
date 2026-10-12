import { Text } from "ui/components/ui/text"

import { LegalPage, LegalSection } from "./legal-page"

export function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy">
      <LegalSection title="Who handles your data">
        <Text>
          Yopem Social operates social.yopem.com. This policy describes how we
          handle personal data when you sign in, use a workspace, connect social
          accounts, upload media, publish content, or use RSS automation and
          analytics.
        </Text>
      </LegalSection>
      <LegalSection title="Data we collect">
        <Text>
          Account data includes your sign-in identifier, email address, and name
          supplied through our authentication service. Workspace data includes
          names, memberships, roles, invitations, and settings. App session
          records contain token hashes and expiry times. We use these records to
          invalidate sessions after sign-out or account deletion. App sign-in
          tokens are not stored in the app database.
        </Text>
        <Text>
          Connected-account data includes platform and account identifiers,
          display names, connection permissions, authorization state, and access
          or refresh credentials needed to call the platform. We request access
          when you connect an account. Social credentials are stored encrypted
          and are not returned to the browser.
        </Text>
        <Text>
          Publishing data includes post text, links, uploaded images and videos,
          destination accounts, platform-specific settings, consent choices,
          schedules, drafts, delivery results, and remote post identifiers. RSS
          data includes feed URLs, settings, imported item identifiers, and
          imported content.
        </Text>
        <Text>
          When you request analytics, we retrieve the metrics available from the
          connected platform. We also process connection callbacks, platform
          event notifications, delivery state, and duplicate-prevention records.
          Our hosting provider processes network and technical data, such as IP
          addresses, request times, and service errors, to operate and protect
          the service.
        </Text>
      </LegalSection>
      <LegalSection title="Why we use data">
        <Text>
          We use your data to authenticate you, enforce workspace permissions,
          connect accounts, store drafts and media, carry out publishing
          instructions, process schedules and RSS feeds, display delivery
          results and analytics, prevent duplicate work, maintain security, and
          respond to support requests.
        </Text>
        <Text>
          Where applicable law requires a legal basis, we process data to
          provide the service you request, protect the service and its users,
          comply with legal duties, or act on your consent where consent is
          required. You can revoke platform access and stop optional
          integrations.
        </Text>
      </LegalSection>
      <LegalSection title="How we share data">
        <Text>
          We send content, media, account identifiers, and required settings to
          the platforms you select for publication. Those platforms handle that
          data under their own terms and privacy policies. Published content can
          become public or visible to the audience selected on the destination
          platform.
        </Text>
        <Text>
          Members of a shared workspace can access workspace content according
          to their roles. Cloudflare provides application hosting, database,
          object storage, and job processing. Our authentication service at
          auth.yopem.com and your chosen sign-in provider process sign-in data.
          RSS sources and media hosts receive requests needed to import their
          content.
        </Text>
        <Text>
          We do not sell personal data or use connected-platform data for
          advertising. We may disclose data when legally required or needed to
          protect users, investigate abuse, or protect the service.
        </Text>
      </LegalSection>
      <LegalSection title="Cookies and security">
        <Text>
          We use access_token and refresh_token cookies to maintain your app
          session. Their browser lifetimes are one day and seven days. We use a
          short-lived oauth_challenge cookie to protect sign-in callbacks. App
          authentication cookies are HTTP-only and host-only, with secure
          transport settings on the HTTPS service. Blocking required cookies can
          prevent sign-in from working.
        </Text>
        <Text>
          We do not use advertising cookies in this app. Connected platforms and
          sign-in providers can use their own cookies when you visit them. We
          use encrypted storage for social credentials, workspace access checks,
          and request validation to protect app data. No system can guarantee
          complete security.
        </Text>
      </LegalSection>
      <LegalSection title="Retention">
        <Text>
          Account and workspace data remain in the app while you use the service
          or while a shared workspace still needs them. Drafts, media,
          schedules, RSS records, and delivery records are not automatically
          deleted merely because you sign out or disconnect a channel. Analytics
          availability depends on the platform and its access rules.
        </Text>
        <Text>
          Scheduled cleanup removes expired app sessions and sign-in or OAuth
          state within 24 hours during normal operation. Completed webhook
          records are removed after seven days. Cleanup uses bounded batches.
          Pending or uncertain publishing state remains until it is resolved or
          its workspace is deleted, so cleanup does not cause duplicate posts.
        </Text>
        <Text>
          Successful account deletion removes your account and sole-member
          workspace data from active app storage, including stored media and
          connection credentials no longer needed by surviving workspaces.
          Shared workspace content remains with that workspace. Hosting-provider
          recovery copies and operational logs can have separate retention
          periods. Contact us for questions about those copies or any retention
          required by law.
        </Text>
      </LegalSection>
      <LegalSection title="Your choices and deletion">
        <Text>
          You can review connected channels, disconnect them, stop RSS
          automation, cancel schedules that have not been dispatched, and remove
          workspace members when your role permits. You can also revoke the
          app's access in each platform's account settings. A channel disconnect
          is not an account-deletion request and does not remove remote posts.
        </Text>
        <Text>
          To delete your app account, open Settings and use account deletion.
          Transfer ownership first if you own a workspace with other members.
          Deletion removes sole-member workspaces and stops app work that has
          not been sent to a platform. If publication is in progress or its
          outcome is uncertain, resolve that state before deletion. Requests
          already accepted by a platform can still finish. Deletion removes your
          membership in retained shared workspaces, but does not delete other
          members' shared content. Signing in again through a new login flow can
          create a new app account. Sessions from the deleted account cannot
          access that new account.
        </Text>
        <Text>
          Contact us for access, correction, export, deletion, or other privacy
          requests that your local law gives you. We may need to verify your
          identity and your authority over workspace data before acting.
          Deleting app data does not delete your Google account, another
          platform account, or content already published on external platforms.
        </Text>
      </LegalSection>
      <LegalSection title="YouTube and Google data">
        <Text>
          Our YouTube integration uses YouTube API Services. When authorized, we
          access your selected channel identity, upload the video and metadata
          you approve, obtain publication status, and retrieve available
          metrics. We use this data only for the connected publishing and
          analytics features described in this policy.
        </Text>
        <Text>
          Read the{" "}
          <a href="https://policies.google.com/privacy">
            Google Privacy Policy
          </a>{" "}
          and{" "}
          <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>
          . You can revoke access through{" "}
          <a href="https://myaccount.google.com/permissions">
            Google account permissions
          </a>
          . Revocation stops authorized access; use app account deletion or
          contact us to request removal of stored app data.
        </Text>
      </LegalSection>
      <LegalSection title="International processing and children">
        <Text>
          Our service providers and connected platforms can process data in
          countries other than your own. Their applicable safeguards and privacy
          terms govern their processing. Contact us with questions about
          international data handling.
        </Text>
        <Text>
          The service is not directed at children. Users must meet the legal
          requirements for using the service and each connected platform.
          Contact us if you believe a child has provided personal data without
          the required permission.
        </Text>
      </LegalSection>
      <LegalSection title="Policy changes">
        <Text>
          We will publish changes and the updated effective date here. We will
          give notice of material changes where required by law. Review this
          policy when you connect a new platform or use a new feature.
        </Text>
      </LegalSection>
    </LegalPage>
  )
}

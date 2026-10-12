import { Text } from "ui/components/ui/text"

import { LegalPage, LegalSection } from "./legal-page"

export function TermsOfService() {
  return (
    <LegalPage title="Terms of Service">
      <LegalSection title="Using Yopem Social">
        <Text>
          These terms govern your use of Yopem Social at social.yopem.com. Yopem
          Social operates this service. By using the service, you agree to these
          terms. If you do not agree, do not use the service.
        </Text>
        <Text>
          You must have legal capacity to accept these terms and meet the age
          requirements of each connected platform. If you act for an
          organization, you must have authority to bind that organization.
        </Text>
      </LegalSection>
      <LegalSection title="Accounts and workspaces">
        <Text>
          Keep your sign-in account secure and your account details accurate.
          You are responsible for activity that you authorize. Workspace owners
          control membership and ownership. Owners, admins, and editors can have
          different access to shared content. Only connect social accounts that
          you are authorized to manage.
        </Text>
        <Text>
          Tell us if you suspect unauthorized access. Remove access when a team
          member no longer needs it. Review destination accounts and permissions
          before you publish or enable automation.
        </Text>
      </LegalSection>
      <LegalSection title="Publishing and automation">
        <Text>
          The service supports drafts, media uploads, scheduled publishing, RSS
          automation, and available platform analytics. Features depend on
          platform credentials, permissions, API access, and platform support. A
          displayed schedule does not guarantee delivery.
        </Text>
        <Text>
          Check text, media, recipients, privacy settings, and required platform
          consent before submitting content. RSS automation can publish new feed
          items without another review when you enable it. You remain
          responsible for content imported from feeds and for obtaining
          publication rights.
        </Text>
        <Text>
          Destinations can return different outcomes. Accepted or processing
          does not mean published. An unknown result can mean that a platform
          received a request but did not confirm it. Do not resubmit uncertain
          results without checking the destination; this can create duplicate
          posts. Cancellation cannot recall content already sent to a platform.
        </Text>
      </LegalSection>
      <LegalSection title="Your content and acceptable use">
        <Text>
          You retain ownership of your content. You grant us permission to
          store, process, copy, and transmit it only as needed to provide the
          service and carry out your instructions. You must hold the rights and
          consent needed for that use.
        </Text>
        <Text>
          Do not publish unlawful, infringing, deceptive, or abusive content. Do
          not send spam, harass people, distribute malware, impersonate others,
          bypass platform restrictions, or access accounts without permission.
          Do not interfere with service security or attempt to access another
          workspace's private data.
        </Text>
      </LegalSection>
      <LegalSection title="Connected platform terms">
        <Text>
          Connected platforms operate independently. Their terms, privacy
          policies, developer policies, and API limits also apply. Yopem Social
          is not endorsed by X, Meta, Bluesky, Google, TikTok, or LinkedIn.
          Platforms can change access, reject content, remove posts, or suspend
          accounts.
        </Text>
        <Text>
          When you use our YouTube features, the service uses YouTube API
          Services and you agree to be bound by the{" "}
          <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>
          . You must comply with platform-specific requirements, including
          TikTok creator consent and posting settings.
        </Text>
      </LegalSection>
      <LegalSection title="Privacy">
        <Text>
          Our <a href="/privacy-policy">Privacy Policy</a> describes the data we
          collect, how we use and share it, and how you can request access or
          deletion. Read it before connecting accounts or uploading content.
        </Text>
      </LegalSection>
      <LegalSection title="Ending use and deleting data">
        <Text>
          You can stop using the service, disconnect channels, and revoke access
          through the connected platform. Disconnecting a channel does not
          delete your app account, stored drafts, or posts already published on
          that platform.
        </Text>
        <Text>
          Use account deletion in Settings to remove your app account and
          sole-member workspaces. If you own a workspace with other members,
          transfer ownership before deleting your account. Shared workspace
          content remains available to its members. Deletion does not remove
          your external sign-in account or remote social posts.
        </Text>
        <Text>
          We may restrict or suspend access to address abuse, security risks,
          legal requirements, or violations of these terms. Contact us if you
          believe a restriction is incorrect.
        </Text>
      </LegalSection>
      <LegalSection title="Availability and responsibility">
        <Text>
          We provide the service as available. To the extent permitted by law,
          we do not give warranties of uninterrupted service, fitness for a
          particular purpose, or successful publication. Keep your own copies of
          content that you need.
        </Text>
        <Text>
          To the extent permitted by law, we are not liable for indirect or
          consequential loss, lost profits, or loss caused by external platform
          failures or content that you authorize. These terms do not limit
          rights or liability that applicable law does not permit us to limit.
        </Text>
      </LegalSection>
      <LegalSection title="Changes to these terms">
        <Text>
          We can update these terms as the service changes. We will publish the
          updated terms and effective date on this page. We will give notice of
          material changes where required by law. Your continued use after an
          update takes effect indicates acceptance, subject to rights that
          applicable law gives you.
        </Text>
      </LegalSection>
    </LegalPage>
  )
}

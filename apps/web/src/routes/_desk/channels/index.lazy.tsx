import * as stylex from "@stylexjs/stylex"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createLazyFileRoute, useSearch } from "@tanstack/react-router"
import { Match } from "effect"
import { useState } from "react"

import { Platform } from "rpc/contracts/channels"
import { Badge } from "ui/components/badge"
import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import { Card, CardHeader, CardTitle, CardPanel } from "ui/components/card"
import { HStack } from "ui/components/hstack"
import { Input } from "ui/components/input"
import { Skeleton } from "ui/components/skeleton"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"
import { Wrap } from "ui/components/wrap"
import { tokens } from "ui/styles/tokens.stylex"

import { deskStyles } from "@/components/desk-styles"
import { Failure, PageHeading } from "@/components/desk-ui"
import { useDeskWorkspace } from "@/components/desk-workspace"
import { AccountSelection } from "@/features/channels/components/account-selection"
import { platformNames } from "@/features/channels/platform-names"
import {
  channelsQuery,
  connectionBeginMutation,
  channelDisconnectMutation,
} from "@/features/channels/queries"

const styles = stylex.create({
  platformCard: {
    width: {
      default: `calc(50% - ${tokens["--spacing"]})`,
      "@media (max-width: 1023px)": "100%",
    },
    marginBlockEnd: "auto",
  },
})

export const Route = createLazyFileRoute("/_desk/channels/")({
  component: ChannelsPage,
})

export function ChannelsPage() {
  const workspace = useDeskWorkspace()
  const { attempt } = useSearch({ from: "__root__" })
  const channels = useQuery(channelsQuery(workspace.id))
  const client = useQueryClient()
  const [loginHint, setLoginHint] = useState("")

  const canManageAccounts = Match.value(workspace.role).pipe(
    Match.when("editor", () => false),
    Match.orElse(() => true),
  )

  const connection = useMutation(
    connectionBeginMutation({ client, workspaceId: workspace.id, loginHint }),
  )

  const disconnection = useMutation(
    channelDisconnectMutation({ client, workspaceId: workspace.id }),
  )

  return (
    <Stack>
      <PageHeading title="Channels" />
      <Text xstyle={[deskStyles.text, deskStyles.muted, deskStyles.small]}>
        Connect accounts you control. Only selected accounts receive workspace
        access.
      </Text>
      <Failure
        error={channels.error ?? connection.error ?? disconnection.error}
      />
      <HStack>
        <Button
          variant="outline"
          disabled={channels.isFetching}
          onClick={() => void channels.refetch()}
        >
          {channels.isError ? "Retry channels" : "Refresh channels"}
        </Button>
      </HStack>
      {channels.isPending && (
        <Stack>
          <Box render={<output />}>Loading channels…</Box>
          <Skeleton aria-hidden="true" />
        </Stack>
      )}
      {attempt && canManageAccounts && (
        <AccountSelection
          key={attempt}
          workspaceId={workspace.id}
          attemptId={attempt}
        />
      )}
      <Wrap>
        {Platform.literals.map((platform) => {
          const availability = channels.data?.platforms.find(
            (item) => item.platform === platform,
          )

          const accounts =
            channels.data?.channels.filter(
              (item) =>
                item.platform === platform && item.status !== "disconnected",
            ) ?? []

          return (
            <Card
              render={<section />}
              xstyle={styles.platformCard}
              key={platform}
              aria-label={platformNames[platform]}
            >
              <CardHeader>
                <HStack>
                  <CardTitle
                    render={
                      <h2>
                        <>{platformNames[platform]}</>
                      </h2>
                    }
                  />
                  {availability && !availability.configured && (
                    <Badge variant="outline">Setup required</Badge>
                  )}
                </HStack>
              </CardHeader>
              <CardPanel>
                <Stack>
                  {availability &&
                    !availability.configured &&
                    availability.reason &&
                    availability.reason !== "Setup required" && (
                      <Text>{availability.reason}</Text>
                    )}
                  {platform === "facebook" && (
                    <Text>
                      Facebook Pages only. Personal profiles are not supported.
                    </Text>
                  )}
                  {platform === "instagram" && (
                    <Text>
                      Professional Instagram accounts only. Personal accounts
                      are not supported.
                    </Text>
                  )}
                  {platform === "youtube" && (
                    <Text>
                      YouTube requires video, a title, visibility, and a
                      made-for-kids choice.
                    </Text>
                  )}
                  {platform === "tiktok" && (
                    <Text>
                      TikTok requires creator review, privacy, interaction,
                      disclosure, and consent choices.
                    </Text>
                  )}
                  {accounts.map((account) => (
                    <HStack
                      key={account.id}
                      xstyle={[
                        deskStyles.rowGap,
                        deskStyles.wrap,
                        deskStyles.alignCenter,
                      ]}
                    >
                      <Text>
                        {account.displayName} ·{" "}
                        {account.status === "connected"
                          ? "Connected"
                          : "Reconnect required"}
                      </Text>
                      {canManageAccounts && (
                        <HStack>
                          <Button
                            variant="outline"
                            disabled={disconnection.isPending}
                            onClick={() => disconnection.mutate(account.id)}
                          >
                            Disconnect {account.displayName}
                          </Button>
                        </HStack>
                      )}
                    </HStack>
                  ))}
                  {canManageAccounts && (
                    <>
                      {platform === "bluesky" && (
                        <label
                          htmlFor="channels-field-1"
                          {...stylex.props(deskStyles.label)}
                        >
                          Bluesky handle
                          <Input
                            id="channels-field-1"
                            value={loginHint}
                            onChange={(event) =>
                              setLoginHint(event.target.value)
                            }
                          />
                        </label>
                      )}
                      <HStack>
                        <Button
                          variant="outline"
                          disabled={
                            !availability?.configured || connection.isPending
                          }
                          onClick={() =>
                            connection.mutate(platform, {
                              onSuccess: (result) =>
                                window.location.assign(result.url),
                            })
                          }
                        >
                          Connect {platformNames[platform]}
                        </Button>
                      </HStack>
                    </>
                  )}
                </Stack>
              </CardPanel>
            </Card>
          )
        })}
      </Wrap>
    </Stack>
  )
}

import * as stylex from "@stylexjs/stylex"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { UsersIcon } from "lucide-react"
import { useState } from "react"

import { Platform } from "rpc/contracts/channels"
import { type Workspace } from "rpc/contracts/workspaces"
import { Badge } from "ui/components/ui/badge"
import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import { Card, CardHeader, CardTitle, CardPanel } from "ui/components/ui/card"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "ui/components/ui/empty"
import { HStack } from "ui/components/ui/hstack"
import { Input } from "ui/components/ui/input"
import { Skeleton } from "ui/components/ui/skeleton"
import { Stack } from "ui/components/ui/stack"
import { Text } from "ui/components/ui/text"
import { Wrap } from "ui/components/ui/wrap"
import { tokens } from "ui/styles/tokens.stylex"

import { deskStyles } from "@/components/desk-styles"
import { Check, Failure, PageHeading } from "@/components/desk-ui"
import { rpcMutation, workspaceQuery } from "@/lib/queries"

const styles = stylex.create({
  platformCard: {
    width: {
      default: `calc(50% - ${tokens["--spacing"]})`,
      "@media (max-width: 1023px)": "100%",
    },
    marginBlockEnd: "auto",
  },
})

export const platformNames: Record<Platform, string> = {
  x: "X",
  threads: "Threads",
  bluesky: "Bluesky",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
}

export function Channels({
  workspace,
  attempt,
}: {
  workspace: Workspace
  attempt?: string
}) {
  const workspaceId = workspace.id

  const query = useQuery(
    workspaceQuery(workspaceId, "channels", (client) =>
      client.ChannelList({ workspaceId }),
    ),
  )

  const client = useQueryClient()
  const [loginHint, setLoginHint] = useState("")
  const manager = workspace.role !== "editor"

  const connect = useMutation(
    rpcMutation(client, workspaceId, (rpc, platform: Platform) =>
      rpc.ConnectionBegin({
        workspaceId,
        platform,
        loginHint: platform === "bluesky" ? loginHint || undefined : undefined,
      }),
    ),
  )

  const disconnect = useMutation(
    rpcMutation(client, workspaceId, (rpc, channelId: string) =>
      rpc.ChannelDisconnect({ workspaceId, channelId }),
    ),
  )

  return (
    <Stack>
      <PageHeading title="Channels" />
      <Text xstyle={[deskStyles.text, deskStyles.muted, deskStyles.small]}>
        Connect accounts you control. Only selected accounts receive workspace
        access.
      </Text>
      <Failure error={query.error ?? connect.error ?? disconnect.error} />
      <HStack>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isError ? "Retry channels" : "Refresh channels"}
        </Button>
      </HStack>
      {query.isPending && (
        <Stack>
          <Box render={<output />}>Loading channels…</Box>
          <Skeleton aria-hidden="true" />
        </Stack>
      )}
      {attempt && manager && (
        <AccountSelection
          key={attempt}
          workspaceId={workspaceId}
          attemptId={attempt}
        />
      )}
      <Wrap>
        {Platform.literals.map((platform) => {
          const availability = query.data?.platforms.find(
            (item) => item.platform === platform,
          )

          const channels =
            query.data?.channels.filter(
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
                  {channels.map((channel) => (
                    <HStack
                      key={channel.id}
                      xstyle={[
                        deskStyles.rowGap,
                        deskStyles.wrap,
                        deskStyles.alignCenter,
                      ]}
                    >
                      <Text>
                        {channel.displayName} ·{" "}
                        {channel.status === "connected"
                          ? "Connected"
                          : "Reconnect required"}
                      </Text>
                      {manager && (
                        <HStack>
                          <Button
                            variant="outline"
                            disabled={disconnect.isPending}
                            onClick={() => disconnect.mutate(channel.id)}
                          >
                            Disconnect {channel.displayName}
                          </Button>
                        </HStack>
                      )}
                    </HStack>
                  ))}
                  {manager && (
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
                            !availability?.configured || connect.isPending
                          }
                          onClick={() =>
                            connect.mutate(platform, {
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

export function AccountSelection({
  workspaceId,
  attemptId,
}: {
  workspaceId: string
  attemptId: string
}) {
  const query = useQuery(
    workspaceQuery(
      workspaceId,
      "accounts",
      (client) => client.ConnectionAccounts({ workspaceId, attemptId }),
      attemptId,
    ),
  )

  const [selected, setSelected] = useState<readonly string[]>([])
  const navigate = useNavigate()

  function dismiss() {
    void navigate({
      to: "/channels",
      search: { workspace: workspaceId },
      replace: true,
    })
  }

  const client = useQueryClient()

  const select = useMutation(
    rpcMutation(client, workspaceId, (rpc, accountIds: readonly string[]) =>
      rpc.ConnectionSelect({ workspaceId, attemptId, accountIds }),
    ),
  )

  return (
    <Card render={<section />} aria-label="Discovered accounts">
      <CardHeader>
        <CardTitle render={<h2>Select accounts</h2>} />
      </CardHeader>
      <CardPanel>
        <Stack>
          <Text>
            Discovery does not grant access. Confirm the accounts for this
            workspace.
          </Text>
          <Failure error={query.error ?? select.error} />
          {query.isError && (
            <HStack>
              <Button
                variant="outline"
                disabled={query.isFetching || select.isPending}
                onClick={() => void query.refetch()}
              >
                Retry discovered accounts
              </Button>
            </HStack>
          )}
          {query.data?.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No accounts were found.</EmptyTitle>
                <EmptyDescription>
                  Dismiss this selection and connect again.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {query.isPending && (
            <Box render={<output />}>Discovering accounts…</Box>
          )}
          {query.data?.map((account) => (
            <Check
              key={account.accountId}
              label={account.displayName}
              checked={selected.includes(account.accountId)}
              disabled={select.isPending}
              onChange={(checked) =>
                setSelected(
                  checked
                    ? [...selected, account.accountId]
                    : selected.filter((id) => id !== account.accountId),
                )
              }
            />
          ))}
          <HStack>
            <Button
              disabled={selected.length === 0 || select.isPending}
              onClick={() => select.mutate(selected, { onSuccess: dismiss })}
            >
              Confirm selected accounts
            </Button>
          </HStack>
          <HStack>
            <Button
              variant="ghost"
              disabled={select.isPending}
              onClick={dismiss}
            >
              Dismiss account selection
            </Button>
          </HStack>
        </Stack>
      </CardPanel>
    </Card>
  )
}

import * as stylex from "@stylexjs/stylex"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Schema } from "effect"
import { useState } from "react"

import { Platform, type Workspace } from "rpc/contracts/models"
import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import { Heading } from "ui/components/ui/heading"
import { Input } from "ui/components/ui/input"
import { Text } from "ui/components/ui/text"

import { Check, Failure, PageHeading, deskStyles } from "@/components/desk-ui"
import { rpcMutation, workspaceQuery } from "@/features/desk/queries"

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
    <Box xstyle={deskStyles.stack}>
      <PageHeading title="Channels" />
      <Text xstyle={deskStyles.muted}>
        Connect accounts you control. Only selected accounts receive workspace
        access.
      </Text>
      <Failure error={query.error ?? connect.error ?? disconnect.error} />
      {query.isPending && <Box render={<output />}>Loading channels…</Box>}
      {attempt && manager && (
        <AccountSelection workspaceId={workspaceId} attemptId={attempt} />
      )}
      {Schema.Literal(...Platform.literals).literals.map((platform) => {
        const availability = query.data?.platforms.find(
          (item) => item.platform === platform,
        )

        const channels =
          query.data?.channels.filter(
            (item) =>
              item.platform === platform && item.status !== "disconnected",
          ) ?? []

        return (
          <Box
            render={<section />}
            key={platform}
            aria-label={platformNames[platform]}
            xstyle={deskStyles.flat}
          >
            <Heading
              render={
                <h2>
                  <>{platformNames[platform]}</>
                </h2>
              }
            />
            {availability && !availability.configured && (
              <>
                <Text>Setup required</Text>
                <Text>{availability.reason}</Text>
              </>
            )}
            {platform === "facebook" && (
              <Text>
                Facebook Pages only. Personal profiles are not supported.
              </Text>
            )}
            {platform === "instagram" && (
              <Text>
                Professional Instagram accounts only. Personal accounts are not
                supported.
              </Text>
            )}
            {platform === "youtube" && (
              <Text>
                YouTube requires video, a title, visibility, and a made-for-kids
                choice.
              </Text>
            )}
            {platform === "tiktok" && (
              <Text>
                TikTok requires creator review, privacy, interaction,
                disclosure, and consent choices.
              </Text>
            )}
            {channels.map((channel) => (
              <Box key={channel.id} xstyle={deskStyles.row}>
                <Text>
                  {channel.displayName} ·{" "}
                  {channel.status === "connected"
                    ? "Connected"
                    : "Reconnect required"}
                </Text>
                {manager && (
                  <Button
                    variant="outline"
                    disabled={disconnect.isPending}
                    onClick={() => disconnect.mutate(channel.id)}
                  >
                    Disconnect {channel.displayName}
                  </Button>
                )}
              </Box>
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
                      onChange={(event) => setLoginHint(event.target.value)}
                    />
                  </label>
                )}
                <Button
                  variant="outline"
                  disabled={!availability?.configured || connect.isPending}
                  onClick={() =>
                    connect.mutate(platform, {
                      onSuccess: (result) => window.location.assign(result.url),
                    })
                  }
                >
                  Connect {platformNames[platform]}
                </Button>
              </>
            )}
          </Box>
        )
      })}
    </Box>
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
  const [confirmed, setConfirmed] = useState(false)
  const client = useQueryClient()

  const select = useMutation(
    rpcMutation(client, workspaceId, (rpc, accountIds: readonly string[]) =>
      rpc.ConnectionSelect({ workspaceId, attemptId, accountIds }),
    ),
  )

  return (
    <Box
      render={<section />}
      aria-label="Discovered accounts"
      xstyle={deskStyles.flat}
    >
      <Heading render={<h2>Select accounts</h2>} />
      <Text>
        Discovery does not grant access. Confirm the accounts for this
        workspace.
      </Text>
      <Failure error={query.error ?? select.error} />
      {query.isPending && <Box render={<output />}>Discovering accounts…</Box>}
      {query.data?.map((account) => (
        <Check
          key={account.accountId}
          label={account.displayName}
          checked={selected.includes(account.accountId)}
          onChange={(checked) =>
            setSelected(
              checked
                ? [...selected, account.accountId]
                : selected.filter((id) => id !== account.accountId),
            )
          }
        />
      ))}
      <Button
        disabled={selected.length === 0 || select.isPending || confirmed}
        onClick={() =>
          select.mutate(selected, { onSuccess: () => setConfirmed(true) })
        }
      >
        Confirm selected accounts
      </Button>
      {confirmed && <Box render={<output />}>Selected accounts connected.</Box>}
    </Box>
  )
}

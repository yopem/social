import * as stylex from "@stylexjs/stylex"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Schema } from "effect"
import { useState } from "react"

import { Platform, type Workspace } from "rpc/contracts/models"
import { Button } from "ui/components/ui/button"
import { Input } from "ui/components/ui/input"

import {
  Check,
  Failure,
  PageHeading,
  deskStyles,
} from "../../../components/desk-ui"
import { rpcMutation, workspaceQuery } from "../queries"

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
        ...(platform === "bluesky" && loginHint ? { loginHint } : {}),
      }),
    ),
  )
  const disconnect = useMutation(
    rpcMutation(client, workspaceId, (rpc, channelId: string) =>
      rpc.ChannelDisconnect({ workspaceId, channelId }),
    ),
  )
  return (
    <div {...stylex.props(deskStyles.stack)}>
      <PageHeading title="Channels" />
      <p {...stylex.props(deskStyles.muted)}>
        Connect accounts you control. Only selected accounts receive workspace
        access.
      </p>
      <Failure error={query.error ?? connect.error ?? disconnect.error} />
      {query.isPending && <p role="status">Loading channels…</p>}
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
          <section
            key={platform}
            aria-label={platformNames[platform]}
            {...stylex.props(deskStyles.flat)}
          >
            <h2>{platformNames[platform]}</h2>
            {availability && !availability.configured && (
              <>
                <p>Setup required</p>
                <p>{availability.reason}</p>
              </>
            )}
            {platform === "facebook" && (
              <p>Facebook Pages only. Personal profiles are not supported.</p>
            )}
            {platform === "instagram" && (
              <p>
                Professional Instagram accounts only. Personal accounts are not
                supported.
              </p>
            )}
            {platform === "youtube" && (
              <p>
                YouTube requires video, a title, visibility, and a made-for-kids
                choice.
              </p>
            )}
            {platform === "tiktok" && (
              <p>
                TikTok requires creator review, privacy, interaction,
                disclosure, and consent choices.
              </p>
            )}
            {channels.map((channel) => (
              <div key={channel.id} {...stylex.props(deskStyles.row)}>
                <p>
                  {channel.displayName} ·{" "}
                  {channel.status === "connected"
                    ? "Connected"
                    : "Reconnect required"}
                </p>
                {manager && (
                  <Button
                    variant="outline"
                    disabled={disconnect.isPending}
                    onClick={() => disconnect.mutate(channel.id)}
                  >
                    Disconnect {channel.displayName}
                  </Button>
                )}
              </div>
            ))}
            {manager && (
              <>
                {platform === "bluesky" && (
                  <label {...stylex.props(deskStyles.label)}>
                    Bluesky handle
                    <Input
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
          </section>
        )
      })}
    </div>
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
    <section
      aria-label="Discovered accounts"
      {...stylex.props(deskStyles.flat)}
    >
      <h2>Select accounts</h2>
      <p>
        Discovery does not grant access. Confirm the accounts for this
        workspace.
      </p>
      <Failure error={query.error ?? select.error} />
      {query.isPending && <p role="status">Discovering accounts…</p>}
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
      {confirmed && <p role="status">Selected accounts connected.</p>}
    </section>
  )
}

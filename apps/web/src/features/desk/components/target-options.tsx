import * as stylex from "@stylexjs/stylex"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import type { Channel, Media, PlatformOverride } from "rpc/contracts/models"
import { Button } from "ui/components/ui/button"
import { Input } from "ui/components/ui/input"

import { Check, Choice, Failure, deskStyles } from "../../../components/desk-ui"
import { workspaceQuery } from "../queries"

const booleanChoices = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
]

export function TargetOptions({
  channel,
  value,
  onChange,
  media,
}: {
  channel: Channel
  value: PlatformOverride
  onChange: (value: PlatformOverride) => void
  media: readonly Media[]
}) {
  const [expanded, setExpanded] = useState(false)
  function update(patch: Partial<PlatformOverride>) {
    onChange({ ...value, ...patch })
  }
  if (channel.platform === "tiktok")
    return (
      <>
        <Button
          variant="outline"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          TikTok options
        </Button>
        {expanded && (
          <TikTokOptions
            channel={channel}
            value={value}
            onChange={onChange}
            media={media}
          />
        )}
      </>
    )
  if (channel.platform !== "youtube" && channel.platform !== "linkedin")
    return null
  return (
    <section
      aria-label={`${channel.displayName} options`}
      {...stylex.props(deskStyles.stack)}
    >
      {channel.platform === "youtube" && (
        <>
          <label {...stylex.props(deskStyles.label)}>
            YouTube title
            <Input
              value={value.title ?? ""}
              onChange={(event) => update({ title: event.target.value })}
            />
          </label>
          <Choice
            label="Made for kids"
            value={
              value.madeForKids === undefined ? "" : String(value.madeForKids)
            }
            options={booleanChoices}
            onChange={(choice) => update({ madeForKids: choice === "true" })}
          />
          <p>Video is required. Choose the audience before publishing.</p>
        </>
      )}
      <Choice
        label={`${channel.platform === "youtube" ? "YouTube" : "LinkedIn"} visibility`}
        value={value.visibility ?? ""}
        options={(channel.platform === "youtube"
          ? ["public", "private", "unlisted"]
          : ["public"]
        ).map((visibility) => ({ value: visibility, label: visibility }))}
        onChange={(visibility) => {
          if (
            visibility === "public" ||
            visibility === "private" ||
            visibility === "unlisted"
          )
            update({ visibility })
        }}
      />
    </section>
  )
}

export function TikTokOptions({
  channel,
  value,
  onChange,
  media,
}: {
  channel: Channel
  value: PlatformOverride
  onChange: (value: PlatformOverride) => void
  media: readonly Media[]
}) {
  const query = useQuery(
    workspaceQuery(
      channel.workspaceId,
      "creator",
      (client) =>
        client.TikTokCreatorInfo({
          workspaceId: channel.workspaceId,
          channelId: channel.id,
        }),
      channel.id,
    ),
  )
  const creator = query.data
  const privacyLevels =
    creator && Array.isArray(creator.privacyLevels)
      ? creator.privacyLevels.filter(
          (level): level is string => typeof level === "string",
        )
      : []
  function update(patch: Partial<PlatformOverride>) {
    onChange({
      ...value,
      ...patch,
      ...(creator ? { creatorInfo: creator } : {}),
      creatorConsent: false,
    })
  }
  const fields = [
    {
      label: "Comments",
      key: "disableComment",
      restricted: creator?.commentDisabled === true,
      inverted: true,
    },
    {
      label: "Duet",
      key: "disableDuet",
      restricted: creator?.duetDisabled === true,
      inverted: true,
    },
    {
      label: "Stitch",
      key: "disableStitch",
      restricted: creator?.stitchDisabled === true,
      inverted: true,
    },
    {
      label: "Branded content",
      key: "brandedContent",
      restricted: false,
      inverted: false,
    },
    { label: "Own brand", key: "ownBrand", restricted: false, inverted: false },
    {
      label: "AI-generated content",
      key: "aiGenerated",
      restricted: false,
      inverted: false,
    },
    {
      label: "Delivery mode",
      key: "draft",
      restricted: false,
      inverted: false,
    },
  ] as const
  return (
    <section
      aria-label="TikTok creator settings"
      {...stylex.props(deskStyles.stack)}
    >
      <h3>Creator preview</h3>
      <Failure error={query.error} />
      {query.isPending && <p role="status">Loading creator information…</p>}
      {creator && (
        <>
          <p>
            {typeof creator.nickname === "string"
              ? creator.nickname
              : "Creator name unavailable"}{" "}
            {typeof creator.username === "string" ? `@${creator.username}` : ""}
          </p>
          {typeof creator.avatarUrl === "string" ? (
            <img
              src={creator.avatarUrl}
              alt="Creator avatar"
              width={48}
              height={48}
            />
          ) : (
            <p>Creator avatar unavailable.</p>
          )}
          <p>
            Maximum video duration:{" "}
            {typeof creator.maxVideoDurationSeconds === "number"
              ? `${creator.maxVideoDurationSeconds} seconds`
              : "unavailable"}
            .
          </p>
        </>
      )}
      <Choice
        label="Privacy level"
        value={value.privacyLevel ?? ""}
        options={privacyLevels.map((level) => ({ value: level, label: level }))}
        disabled={!creator}
        onChange={(privacyLevel) => update({ privacyLevel })}
      />
      {fields.map((field) => (
        <div key={field.key}>
          <Choice
            label={field.label}
            value={
              value[field.key] === undefined
                ? ""
                : String(field.inverted ? !value[field.key] : value[field.key])
            }
            options={
              field.key === "draft"
                ? [
                    { value: "false", label: "Publish" },
                    { value: "true", label: "Upload draft" },
                  ]
                : booleanChoices.map((choice) => ({
                    ...choice,
                    disabled: field.restricted && choice.value === "true",
                  }))
            }
            disabled={!creator}
            onChange={(choice) =>
              update({
                [field.key]: field.inverted
                  ? choice !== "true"
                  : choice === "true",
              })
            }
          />
          {field.restricted && (
            <p>{field.label} unavailable for this creator. Select No.</p>
          )}
        </div>
      ))}
      {media.length > 0 && media.every((item) => item.kind === "image") && (
        <Choice
          label="Photo cover"
          value={
            value.photoCoverIndex === undefined
              ? ""
              : String(value.photoCoverIndex)
          }
          options={media.map((item, index) => ({
            value: String(index),
            label: item.name,
          }))}
          onChange={(choice) => update({ photoCoverIndex: Number(choice) })}
        />
      )}
      <Check
        label="I approve publishing to this TikTok account"
        checked={value.creatorConsent === true}
        disabled={!creator}
        onChange={(creatorConsent) =>
          onChange({
            ...value,
            creatorConsent,
            ...(creator ? { creatorInfo: creator } : {}),
          })
        }
      />
      <p>
        Review the post and creator choices before approval. Changing content
        requires new approval.
      </p>
    </section>
  )
}

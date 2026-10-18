import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { HashSet } from "effect"
import { UsersIcon } from "lucide-react"
import { useState } from "react"

import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import { Card, CardHeader, CardTitle, CardPanel } from "ui/components/card"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "ui/components/empty"
import { HStack } from "ui/components/hstack"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"

import { Check, Failure } from "@/components/desk-ui"
import {
  connectionAccountsQuery,
  connectionSelectMutation,
} from "@/features/channels/queries"

export function AccountSelection({
  workspaceId,
  attemptId,
}: {
  workspaceId: string
  attemptId: string
}) {
  const accounts = useQuery(connectionAccountsQuery({ workspaceId, attemptId }))
  const [selected, setSelected] = useState<readonly string[]>([])
  const selectedAccountIds = HashSet.fromIterable(selected)
  const navigate = useNavigate()
  const client = useQueryClient()

  const selection = useMutation(
    connectionSelectMutation({ client, workspaceId, attemptId }),
  )

  function dismiss() {
    void navigate({
      to: "/channels",
      search: { workspace: workspaceId },
      replace: true,
    })
  }

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
          <Failure error={accounts.error ?? selection.error} />
          {accounts.isError && (
            <HStack>
              <Button
                variant="outline"
                disabled={accounts.isFetching || selection.isPending}
                onClick={() => void accounts.refetch()}
              >
                Retry discovered accounts
              </Button>
            </HStack>
          )}
          {accounts.data?.length === 0 && (
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
          {accounts.isPending && (
            <Box render={<output />}>Discovering accounts…</Box>
          )}
          {accounts.data?.map((account) => (
            <Check
              key={account.accountId}
              label={account.displayName}
              checked={HashSet.has(selectedAccountIds, account.accountId)}
              disabled={selection.isPending}
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
              disabled={selected.length === 0 || selection.isPending}
              onClick={() => selection.mutate(selected, { onSuccess: dismiss })}
            >
              Confirm selected accounts
            </Button>
          </HStack>
          <HStack>
            <Button
              variant="ghost"
              disabled={selection.isPending}
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

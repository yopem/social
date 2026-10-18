import * as stylex from "@stylexjs/stylex"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { Button } from "ui/components/button"
import { Card, CardHeader, CardTitle, CardPanel } from "ui/components/card"
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "ui/components/dialog"
import { HStack } from "ui/components/hstack"
import { Input } from "ui/components/input"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"

import { deskStyles } from "@/components/desk-styles"
import { Failure } from "@/components/desk-ui"
import { accountDeletionMutation } from "@/features/accounts/queries"

export function AccountDeletionSettings() {
  const client = useQueryClient()
  const deletion = useMutation(accountDeletionMutation(client))
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState("")

  return (
    <Card render={<section />}>
      <CardHeader>
        <CardTitle render={<h2>Delete account</h2>} />
      </CardHeader>
      <CardPanel>
        <Stack>
          <Text>
            Delete your account, local credentials, and workspaces where you are
            the only member. Shared workspace data stays for other members.
            Transfer ownership of all shared workspaces first.
          </Text>
          <Text>
            This does not delete posts on social platforms or revoke provider
            access. Remove provider access on each platform. Account deletion
            cannot be undone.
          </Text>
          <Dialog
            open={open}
            onOpenChange={(value) => {
              if (!deletion.isPending) {
                setOpen(value)
                setConfirmation("")
              }
            }}
          >
            <HStack>
              <DialogTrigger render={<Button variant="outline" />}>
                Delete account
              </DialogTrigger>
            </HStack>
            <DialogPopup>
              <DialogHeader>
                <DialogTitle>Delete account and data?</DialogTitle>
              </DialogHeader>
              <DialogPanel>
                <Stack>
                  <Text>
                    Your account and sole-member workspace data will be
                    permanently deleted.
                  </Text>
                  <label
                    htmlFor="delete-account-confirmation"
                    {...stylex.props(deskStyles.label)}
                  >
                    Type DELETE to confirm
                    <Input
                      id="delete-account-confirmation"
                      value={confirmation}
                      disabled={deletion.isPending}
                      onChange={(event) => setConfirmation(event.target.value)}
                    />
                  </label>
                  <Failure error={deletion.error} />
                  <HStack>
                    <Button
                      disabled={confirmation !== "DELETE" || deletion.isPending}
                      loading={deletion.isPending}
                      onClick={() => deletion.mutate()}
                    >
                      Delete account and data
                    </Button>
                  </HStack>
                  <HStack>
                    <Button
                      variant="outline"
                      disabled={deletion.isPending}
                      onClick={() => setOpen(false)}
                    >
                      Cancel
                    </Button>
                  </HStack>
                </Stack>
              </DialogPanel>
            </DialogPopup>
          </Dialog>
        </Stack>
      </CardPanel>
    </Card>
  )
}

import { appStore, useAppState } from "../lib/store";
import { Dialog } from "./Dialog";
import { Button } from "./Button";

export function EulaDialog() {
  const { eulaOpen } = useAppState();
  return (
    <Dialog
      open={eulaOpen}
      onClose={() => appStore.declineEula()}
      title="Minecraft End User License Agreement"
      description="OpenClient does not bundle Minecraft. Before the game starts, you need to accept Mojang's EULA."
      width="normal"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() =>
              void window.openclient.app.openExternal(
                "https://www.minecraft.net/en-us/eula",
              )
            }
          >
            Read the EULA
          </Button>
          <span className="spacer" />
          <Button variant="secondary" onClick={() => appStore.declineEula()}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void appStore.acceptEula()}>
            Accept and launch
          </Button>
        </>
      }
    >
      <p className="field-hint" style={{ fontSize: 12, lineHeight: 1.65 }}>
        This acceptance is stored in your local OpenClient settings and writes
        <span className="mono"> eula=true </span>
        to the selected profile's game directory. You can revoke it at any time by
        editing or deleting that file. Minecraft Java Edition is sold separately by
        Mojang and Microsoft.
      </p>
    </Dialog>
  );
}

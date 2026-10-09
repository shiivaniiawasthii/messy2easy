import { createContext, useCallback, useContext, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { Modal } from "./Modal";
import { Button } from "./ui";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  icon?: IconName;
  /** Only an OK button (for messages). */
  alertOnly?: boolean;
};

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask>(async () => false);

/** In-app replacement for window.confirm / window.alert, styled like the rest of the app. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const ask = useCallback<Ask>((options) => new Promise((resolve) => setRequest({ ...options, resolve })), []);
  const close = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };
  return <ConfirmContext.Provider value={ask}>
    {children}
    {request && <Modal title={request.title} onClose={() => close(false)}>
      <div className="modal-body confirm-body">
        {request.icon && <span className={`confirm-icon ${request.danger ? "danger" : ""}`}><Icon name={request.icon} size={22}/></span>}
        {request.message && <p>{request.message}</p>}
        <div className="modal-actions">
          {!request.alertOnly && <Button variant="ghost" onClick={() => close(false)}>{request.cancelLabel ?? "Cancel"}</Button>}
          <Button variant={request.danger ? "danger" : "primary"} onClick={() => close(true)}>{request.confirmLabel ?? "OK"}</Button>
        </div>
      </div>
    </Modal>}
  </ConfirmContext.Provider>;
}

export const useConfirm = () => useContext(ConfirmContext);

/** The same sign-out question everywhere. */
export const SIGN_OUT_CONFIRM: ConfirmOptions = {
  title: "Sign out?",
  message: "You’ll need your mobile number and password to log in again on this device.",
  confirmLabel: "Sign out",
  icon: "arrow",
  danger: true,
};

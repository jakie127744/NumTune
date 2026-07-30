export interface ConfirmRequest {
  id: number;
  message: string;
  resolve: (value: boolean) => void;
}

type Listener = (request: ConfirmRequest | null) => void;

let listener: Listener | null = null;
let nextId = 1;

export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!listener) {
      // Host not mounted yet (shouldn't happen once ConfirmDialogHost is in
      // the root layout) — fail safe to the native dialog rather than
      // silently resolving true/false.
      resolve(window.confirm(message));
      return;
    }
    const id = nextId++;
    listener({ id, message, resolve });
  });
}

export function subscribeConfirm(l: Listener): () => void {
  listener = l;
  return () => {
    if (listener === l) listener = null;
  };
}

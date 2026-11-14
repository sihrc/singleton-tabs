export function describeSaveResult(result, successMessage = "Settings saved.") {
  if (result?.warning) {
    return {
      kind: "warning",
      message: `Settings saved, but tabs could not be reconciled: ${result.warning.message} Use Reconcile now from the popup to try again.`,
    };
  }
  return { kind: "success", message: successMessage };
}

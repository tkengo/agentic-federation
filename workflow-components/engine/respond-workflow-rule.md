## CRITICAL: respond-workflow requirement

You MUST call `fed session respond-workflow <value>` before finishing your task.
This is how the workflow engine knows your step is complete. If you exit without calling it, the engine will treat it as an error and the workflow will stop.

@slot(value_instruction)
Call `fed session respond-workflow done` when your task is complete.
@endslot

### When you encounter an error

Even if you cannot complete your task due to errors or precondition failures, you MUST still call `fed session respond-workflow` with an appropriate value (e.g., `fail` or `error`) and explain the problem in your output. Never exit silently without responding.

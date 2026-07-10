<script>
  // Copies the current shareable URL (state is already synced into the address
  // bar) to the clipboard. getUrl is injectable so it can be tested headlessly.
  let { getUrl = () => location.href } = $props();

  let copied = $state(false);
  let timer;

  async function copy() {
    try {
      await navigator.clipboard.writeText(getUrl());
      copied = true;
      clearTimeout(timer);
      timer = setTimeout(() => (copied = false), 2000);
    } catch {
      // Clipboard access can be denied (permissions, insecure context). Leave
      // the label unchanged rather than falsely claiming success.
      copied = false;
    }
  }
</script>

<button type="button" class="copy-link" data-testid="copy-link" onclick={copy}>
  {copied ? 'Copied!' : 'Copy link'}
</button>

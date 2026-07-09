<script>
  import '../app.css';

  let { children } = $props();
</script>

{@render children()}

<footer>
  <div class="footer-inner">
    <span class="footer-brand">bettercal</span>
    <p class="footer-copy">
      Unofficial view of
      <a href="https://northeastern.libcal.com/reserve/spaces/studyspace" target="_blank" rel="noopener"
        >Northeastern LibCal</a
      >. Booking happens on LibCal. Refreshes every minute.
    </p>
  </div>
</footer>

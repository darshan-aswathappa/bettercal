<script>
  import '../app.css';

  let { children } = $props();
</script>

<div class="page-content">
  {@render children()}
</div>

<footer>
  <div class="footer-inner">
    <span class="footer-brand">SnellView</span>
    <div class="footer-right">
      <a class="footer-link" href="/watchlist">Your watchlist</a>
    </div>
  </div>
</footer>

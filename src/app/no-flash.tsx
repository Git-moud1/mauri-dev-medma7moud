/**
 * Inline script injected before hydration to set the theme (dark class) from
 * localStorage — prevents a flash of the wrong theme on first paint.
 *
 * lang and dir are NOT set here any more: they are server-rendered per route by
 * the [locale] layout. Leaving the old localStorage-driven override in place
 * would clobber the server value on every non-Arabic route.
 *
 * The one-time localStorage -> cookie locale migration lands in Task 7.
 */
export function NoFlashScript() {
  const code = `(function(){try{
    var t=localStorage.getItem('bc-theme');
    if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
    var r=document.documentElement;
    if(t==='dark'){r.classList.add('dark');}
    r.style.colorScheme=t;
  }catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

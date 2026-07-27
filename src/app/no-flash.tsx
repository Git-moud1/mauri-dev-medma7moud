/**
 * Inline pre-hydration script. Two jobs:
 *
 * 1. Theme — read `bc-theme` from localStorage (falling back to the OS
 *    preference) and set the dark class + colorScheme before first paint.
 *    Its default must stay in sync with ThemeProvider's initial state.
 *
 * 2. One-time locale migration — v1 stored the locale in localStorage under
 *    `bc-locale`. v2 needs it in a cookie so proxy.ts can read it when
 *    redirecting `/`. This moves any legacy value across and deletes the key,
 *    so an existing visitor keeps the language they picked in v1. An already
 *    set cookie always wins; anything that is not a supported locale is
 *    ignored. Idempotent: once the key is gone this branch is a no-op.
 *    Scheduled for removal once the v1 cohort has cycled through.
 *
 * lang and dir are NOT set here any more — they are server-rendered per route.
 */
export function NoFlashScript() {
  const code = `(function(){try{
    var t=localStorage.getItem('bc-theme');
    if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
    var r=document.documentElement;
    if(t==='dark'){r.classList.add('dark');}
    r.style.colorScheme=t;
    var legacy=localStorage.getItem('bc-locale');
    if(legacy&&['ar','en','fr'].indexOf(legacy)!==-1){
      if(document.cookie.indexOf('bc-locale=')===-1){
        document.cookie='bc-locale='+legacy+';path=/;max-age=31536000;samesite=lax';
      }
      localStorage.removeItem('bc-locale');
    }
  }catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

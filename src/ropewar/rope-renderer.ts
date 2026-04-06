/**
 * Rope visualization — maps server rope position to DOM.
 */

export function updateRope(position: number): void {
    // position is -100 to +100
    // Map to percentage: 0% = far left (-100), 50% = center (0), 100% = far right (+100)
    const marker = document.getElementById('rope-marker');
    if (!marker) return;
    const pct = (position + 100) / 200 * 100;
    marker.style.left = pct + '%';
}

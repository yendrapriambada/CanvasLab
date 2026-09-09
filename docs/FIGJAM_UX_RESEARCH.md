# FigJam interaction research and implementation

Reviewed official Figma documentation on 8–9 September 2026 in response to the requested interaction improvements. This is an independent CanvasLab implementation; it does not import Figma proprietary code, assets, or file formats.

| Reference behavior | Official source | CanvasLab implementation |
|---|---|---|
| Drag shapes from the toolbar into the board | [Collaborating in FigJam](https://www.figma.com/best-practices/collaborating-in-figjam/) | Pointer-captured toolbar tools for sticky notes, shapes, text and sections, with a live canvas preview. Shape palette items also support dragging. |
| Draw a section by dragging its desired bounds | [Create your first meeting board](https://help.figma.com/hc/en-us/articles/14942424871575-Create-your-first-meeting-board-in-FigJam) | Click Section or Shift+S, then drag. Live width/height feedback; release commits one creation. Existing objects inside join the section. |
| Quick-create handles at object sides | [Build faster with quick create](https://help.figma.com/hc/en-us/articles/1500004291601-Build-faster-with-quick-create-in-FigJam) | Hover near a shape or sticky, then drag a side handle to another object. Clicking a handle connects the nearest suitable object in that direction, or creates a connected sibling when no target exists. Handles support Enter/Space. The nearest-target click behavior is a CanvasLab design choice. |
| Connectors bind to objects and follow movement; bent connectors avoid objects | [Create diagrams and flows with connectors](https://help.figma.com/hc/en-us/articles/1500004414542-Create-diagrams-and-flows-with-connectors-in-FigJam) | Named local-side anchors follow rotation and resizing. Deterministic orthogonal routing uses obstacle clearance and rounded turns, with a highlighted nearby drop target. Paths are cached during camera-only changes. |
| Trackpad/mouse pan, pointer zoom, temporary hand tool | [Pan and zoom in FigJam](https://help.figma.com/hc/en-us/articles/1500004414582-Pan-and-zoom-in-FigJam) | Wheel input accumulates into a camera target and is interpolated via requestAnimationFrame. Ctrl/Command+wheel stays anchored to the pointer; Shift+wheel pans horizontally. Space or middle-button drag directly follows the hand. Reduced-motion preference disables interpolation. |
| File name and page navigation occupy the upper-left control area | [Use FigJam with a screen reader](https://help.figma.com/hc/en-us/articles/14477051168791-Use-FigJam-with-a-screen-reader) | Page dropdown is integrated beneath the title, next to outline access. Each page remembers its camera for the current editor session. |

Visual refinements are our own interpretation of the request: stronger sticky colors, a folded note corner and shadow, softer shape corners, rounded section boundaries, clearer toolbar silhouettes and stronger panel borders. The dot grid uses 1.35 px dots at normal zoom with adaptive spacing at low zoom. Default object dragging is free of the old mandatory 10 px grid; nearby alignment guides have a small screen-space threshold. Optional grid snap remains available.

## Practical limits

Routing is bounded to a nearby obstacle visibility graph. Enclosed/overlapping endpoints can make a clear orthogonal route impossible; attachments are preserved in the fallback. The rounded visual tips of polygons approximate their mathematical boundary. This does not reproduce every FigJam shape, animation, connector editing mode or quick-create variant. Camera locations are remembered per page within the open editor session. Physical trackpad and tablet feel still benefits from human review; browser automation covers the pointer and wheel mechanics.

## Verification

See [test report](TEST_REPORT.md), [toolbar interaction tests](../tests/e2e/toolbar-ux.spec.ts), [routing tests](../tests/connector-routing.test.ts), [transform tests](../tests/transforms.test.ts), and the actual [benchmark artifact](../artifacts/benchmark.json).

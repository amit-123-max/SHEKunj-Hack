# Mock Data for NeuroRead AI Testing

MOCK_TEXTS = {
    "academic": {
        "source": "The implementation of the proposed architectural framework demonstrates a significant reduction in cognitive overhead by leveraging a non-static model rotation mechanism.",
        "simple": "Our new system is easier to use because it automatically switches between different AI models.",
        "cam_score": 85
    },
    "legal": {
        "source": "Notwithstanding any provisions to the contrary, the user hereby acknowledges that the processing of telemetry data shall be conducted in accordance with the established privacy protocols.",
        "simple": "You agree that we will follow our privacy rules when we handle your data.",
        "cam_score": 40
    },
    "medical": {
        "source": "The patient presented with acute idiopathic pulmonary edema, exacerbated by high-altitude exposure and suboptimal acclimatization procedures.",
        "simple": "The person had trouble breathing because they went too high up without getting used to the thin air.",
        "cam_score": 55
    }
}

MOCK_SKELETON = """
<html>
    <nav>Navigation Bar</nav>
    <main id="content">
        <article>
            <h1>Main Article Title</h1>
            <p>Some important content here.</p>
        </article>
    </main>
    <aside class="ads">Some distracting ads</aside>
    <footer>Copyright 2026</footer>
</html>
"""

MOCK_FOCUS_MAP = {
    "main_content_selector": "#content article",
    "hide_selectors": "nav, .ads, footer"
}

document.addEventListener('DOMContentLoaded', () => {
    const bgSelect = document.getElementById('bgSelect');
    const recipeSheet = document.getElementById('recipeSheet');
    const btnPdf = document.getElementById('btnPdf');

    // Cambiar fondo según la selección
    bgSelect.addEventListener('change', (e) => {
        const selectedBg = e.target.value;
        if (selectedBg) {
            recipeSheet.style.backgroundImage = `url('${selectedBg}')`;
        } else {
            recipeSheet.style.backgroundImage = 'none';
        }
    });

    // Disparar la ventana de impresión nativa (Guardar como PDF)
    btnPdf.addEventListener('click', () => {
        window.print();
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const bgSelect = document.getElementById('bgSelect');
    const recipeSheet = document.getElementById('recipeSheet');
    const btnPdf = document.getElementById('btnPdf');
    const textColor = document.getElementById('textColor');
    const fontSizeSelect = document.getElementById('fontSizeSelect');

    // Fondo inicial automático
    if (bgSelect.value) {
        recipeSheet.style.backgroundImage = `url('${bgSelect.value}')`;
    }

    // Cambiar fondo
    bgSelect.addEventListener('change', (e) => {
        const selectedBg = e.target.value;
        if (selectedBg) {
            recipeSheet.style.backgroundImage = `url('${selectedBg}')`;
        } else {
            recipeSheet.style.backgroundImage = 'none';
        }
    });

    // Comandos de formato de texto
    document.querySelectorAll('.tools-row button[data-command]').forEach(button => {
        button.addEventListener('click', () => {
            const command = button.getAttribute('data-command');
            document.execCommand(command, false, null);
        });
    });

    // Cambiar color de texto seleccionado
    textColor.addEventListener('input', (e) => {
        document.execCommand('foreColor', false, e.target.value);
    });

    // Cambiar tamaño de texto seleccionado
    fontSizeSelect.addEventListener('change', (e) => {
        document.execCommand('fontSize', false, e.target.value);
    });

    // Descargar PDF
    btnPdf.addEventListener('click', () => {
        window.print();
    });
});

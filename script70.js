var CalculadorViewModel = function () {
    return {
        CodigoTramite: '',
        NroFormulario: '',
        Chasis: '',
        Tramite: '',
        Adquisicion: '',
        TipoVehiculo: '',
        PrecioCompra: '',
        CantidadCedulas: 0,
        CantidadCedulasAdicionales: 0
    };
};

var PresupuestoViewModel = function () {
    return {
        CodigoTramite: '',
        NombreTramite: '',
        Importe: 0,
        Conceptos: []
    };
};
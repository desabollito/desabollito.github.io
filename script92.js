var provincias = [
    { "Key": "A", "Value": "SALTA" },
    { "Key": "B", "Value": "BUENOS AIRES" },
    { "Key": "C", "Value": "CIUDAD AUTONOMA DE BUENOS AIRES" },
    { "Key": "D", "Value": "SAN LUIS" },
    { "Key": "E", "Value": "ENTRE RIOS" },
    { "Key": "F", "Value": "LA RIOJA" },
    { "Key": "G", "Value": "SANTIAGO DEL ESTERO" },
    { "Key": "H", "Value": "CHACO" },
    { "Key": "J", "Value": "SAN JUAN" },
    { "Key": "K", "Value": "CATAMARCA" },
    { "Key": "L", "Value": "LA PAMPA" },
    { "Key": "M", "Value": "MENDOZA" },
    { "Key": "N", "Value": "MISIONES" },
    { "Key": "P", "Value": "FORMOSA" },
    { "Key": "Q", "Value": "NEUQUEN" },
    { "Key": "R", "Value": "RIO NEGRO" },
    { "Key": "S", "Value": "SANTA FE" },
    { "Key": "T", "Value": "TUCUMAN" },
    { "Key": "U", "Value": "CHUBUT" },
    { "Key": "V", "Value": "TIERRA DEL FUEGO" },
    { "Key": "W", "Value": "CORRIENTES" },
    { "Key": "X", "Value": "CORDOBA" },
    { "Key": "Y", "Value": "JUJUY" },
    { "Key": "Z", "Value": "SANTA CRUZ" }
];

var tiposTramiteEstimador = [
    {
        "CodigoTramite": "01xxxx",
        "NombreTramite": "INSCRIPCION INICIAL DE 0KM"
    },
    {
        "CodigoTramite": "08xxxx",
        "NombreTramite": "TRANSFERENCIA"
    }
];

var OperacionEnum = {
    IniciarTramite: 1,
    InformeWeb: 2,
    TransferenciaDigital: 3,
    Consulta: 4,
    RetirarDocumentacion: 5,
    Mandatario: 6,
    Turno: 7,
    ModificarTurno: 8,
    ConsultaTramite: 9,
    AsociacionesProfesionales: 10,
    TramiteDigital: 11
};

var Solicitud = function () {
    return {
        numeroPrecarga: null,
        codigoParaServicios: null,
        codigoProvincia: null,
        operacion: null,
        solicitante: null,
        vehiculo: null,
        registro: null,
        pago: null,
        turno: null,
        tramite: null,
        tipoTramite: null,
        precarga: null,
        transferencia: null,
        turnoToday: '',
        turnoStart: '',
        turnoEnd: '',
        diasnolaborables: null,
        horasValidez: '',
        codigoEmail: '',
        //errorPago: null,
        emailValido: false,
        registroVEPHabilitado: false,
        registroPagoMisCuentasHabilitado: false,
        registroTurnoPagoHabilitado: false,
        //MANDATARIO
        esMandatario: false,
        mandatarioCertificaFirma: null,
        mandatarioRequiereF13I: null,
        mandatarioNombre: null,
        mandatarioApellido: null,
        mandatarioNumeroMatricula: null,
        mandatarioTipoDocumento: null,
        mandatarioNumeroDocumento: null,
        mandatarioCuit: null,
        mandatarioEmail: null,
        clearMandatario: function () {
            esMandatario = null;
            mandatarioCertificaFirma = null;
            mandatarioRequiereF13I = null;
            mandatarioNombre = null;
            mandatarioApellido = null;
            mandatarioMatricula = null;
            mandatarioTipoDocumento = null;
            mandatarioNumeroDocumento = null;
            mandatarioCuit = null;
            mandatarioEmail = null;
            mostrarDetalle = null;
        },
        //END:MANDATARIO
        //ESCRIBANOS
        esEscribano: null,
        escribanoNombre: null,
        escribanoApellido: null,
        escribanoMatricula: null,
        escribanoCuit: null,
        escribanoEmail: null,
        clearEscribano: function () {
            esEscribano = null;
            escribanoNombre = null;
            escribanoApellido = null;
            escribanoMatricula = null;
            escribanoCuit = null;
            escribanoEmail = null;
            mostrarDetalle = null;
        },
        //END:ESCRIBANOS
        //TIPO-TRAMITE
        codigoTramite: null,
        vehiculos: null,
        nombreTramite: null,
        requiereDominio: null,
        excluyeDominio: null,
        excluyeRegistro: null,
        implementado: null,
        conPresupuesto: null,
        precargaDesarrollada: null,
        requiereTitular: null,
        clearTipoTramite: function () {
            codigoTramite = null;
            nombreTramite = null;
            requiereDominio = null;
            excluyeDominio = null;
            implementado = null;
            conPresupuesto = null;
            precargaDesarrollada = null;
            requiereTitular = null;
        },
        //END:TIPO-TRAMITE
        //VEHICULO
        dominio: null,
        codigoVehiculo: null,
        esPlacaMercosur: null,
        marca: null,
        modelo: null,
        anio: null,
        clearVehiculo: function () {
            dominio = null;
            codigoVehiculo = null;
            marca = null;
            modelo = null;
            anio = null;
        },
        vehiculoMarca: null,
        vehiculoModelo: null,
        vehiculoTipo: null,
        vehiculoAnio: null,
        vehiculoOrigen: null,
        vehiculoValorTabla: null,
        //END:VEHICULO
        //REGISTRO
        codigoRegistroSeccional: null,
        registroDenominacion: null,
        registroLocalidad: null,
        registroDireccion: null,
        registroTelefono: null,
        registroHorario: null,
        //END:REGISTRO
        //TURNO
        fecha: null,
        hora: null,
        //END:TURNO
        armarObjetoParaPost: function () {
            return {
                NumeroPrecarga: this.numeroPrecarga,
                CodigoParaServicios: this.codigoParaServicios,
                Operacion: this.operacion,
                Solicitante: !this.solicitante ? null : {
                    Buscado: this.solicitante.buscado,
                    IdTipoCaracterSolicitante: this.solicitante.idTipoCaracterSolicitante,
                    Email: this.solicitante.email,
                    Apellido: this.solicitante.apellido,
                    Nombre: this.solicitante.nombre,//EN EL SERVICIO DE AFIP VIENE NOMBRE Y APELLIDO EN LA MISMA VARIABLE
                    TipoDocumento: this.solicitante.tipoDocumento,
                    NumeroDocumento: this.solicitante.numeroDocumento,
                    CodigoArea: this.solicitante.codigoArea,
                    Telefono: this.solicitante.telefono,
                    CodigoAreaCelular: this.solicitante.codigoAreaCelular,
                    TelefonoCelular: this.solicitante.telefonoCelular,
                    OperadorCelular: this.solicitante.operadorCelular,
                    EsMandatario: this.solicitante.esMandatario,
                    nroMatriculaMandatario: this.solicitante.nroMatriculaMandatario,
                    Cuit: this.solicitante.cuit
                },
                //Vehiculo: !this.vehiculo ? null : {
                //    Dominio: this.vehiculo.dominio,
                //    CodigoVehiculo: this.vehiculo.codigoVehiculo
                //},
                //Registro: !this.registro ? null : {
                //    CodigoRegistroSeccional: this.registro.codigoRegistroSeccional
                //},
                Pago: !this.pago || this.operacion === OperacionEnum.RetirarDocumentacion ? null : {
                    FormaPago: this.pago.formaPago,
                    MedioPago: this.pago.medioPago,
                    CodigoRed: this.pago.codigoRed,
                    CodigoBanco: this.pago.codigoBanco,
                    TipoDocumento: this.pago.tipoDocumento,
                    NumeroDocumento: this.pago.numeroDocumento,
                    Email: this.pago.email,
                    PrecioTotalPrecalculado: this.pago.montoPresupuesto
                },
                //Turno: !this.turno ? null : {
                //    Fecha: this.turno.fecha,
                //    Hora: this.turno.hora
                //},
                Tramite: !this.tramite ? null : {
                    NumeroTramite: this.tramite.numeroTramite
                },
                //TipoTramite: !this.tipoTramite ? null : {
                //    CodigoTramite: this.tipoTramite.codigoTramite
                //},
                Precarga: !this.precarga ? null : {
                    Titular: !this.precarga.titular ? null : {
                        Apellido: this.precarga.titular.apellido,
                        Nombre: this.precarga.titular.nombre,
                        TipoPersona: this.precarga.titular.tipoPersona,
                        NumeroDocumento: this.precarga.titular.numeroDocumento,
                        TipoDocumento: this.precarga.titular.tipoDocumento,
                        Cuit: this.precarga.titular.cuit,
                        RazonSocial: this.precarga.titular.razonSocial,
                        CuitCuil: this.precarga.titular.cuitCuil,
                    },
                    Comprador: !this.precarga.comprador ? null : {
                        FechaEntrega: this.precarga.comprador.fechaEntrega,
                        Lugar: this.precarga.comprador.lugar,
                        CodigoPersona: this.precarga.comprador.codigoPersona,
                        TipoDocumento: this.precarga.comprador.tipoDocumento,
                        NumeroDocumento: this.precarga.comprador.numeroDocumento,
                        Apellido: this.precarga.comprador.apellido,
                        Nombre: this.precarga.comprador.nombre,
                        Cuit: this.precarga.comprador.cuit,
                        RazonSocial: this.precarga.comprador.razonSocial,
                        CargarDomicilio: this.precarga.comprador.cargarDomicilio,
                        Provincia: this.precarga.comprador.provincia,
                        Partido: this.precarga.comprador.partido,
                        Localidad: this.precarga.comprador.localidad,
                        CodigoPostal: this.precarga.comprador.codigoPostal,
                        Barrio: this.precarga.comprador.barrio,
                        Calle: this.precarga.comprador.calle,
                        Numero: this.precarga.comprador.numero,
                        Piso: this.precarga.comprador.piso,
                        Departamento: this.precarga.comprador.departamento
                    },
                    Motivo: this.precarga.motivo,
                    SolicitarExpediciones: this.precarga.solicitarExpediciones,
                    CedulasTitulares: this.precarga.cedulasTitulares,
                    CedulasAutorizados: this.precarga.cedulasAutorizados,
                    CertificadoInscripcionPartida: this.precarga.certificadoInscripcionPartida,
                    CertificadoInscripcionNumero: this.precarga.certificadoInscripcionNumero,
                    CertificadoInscripcionAnio: this.precarga.certificadoInscripcionAnio,
                    NumeroChasis: this.precarga.numeroChasis,
                    IdTramitePosteriorPrendaNumero: this.precarga.idTramitePosteriorPrendaNumero,
                    CertificadoPrendaNumero:  this.precarga.certificadoPrendaNumero,
                    ValorDeclarado: this.precarga.valorDeclarado,
                    ValorPesos: this.precarga.valorPesos,
                    DominioPrecargaRelacionada: this.precarga.dominioPrecargaRelacionada,
                    NumeroPrecargaRelacionada: this.precarga.numeroPrecargaRelacionada,
                    DenunciaCompra: this.precarga.denunciaCompra
                },
                CodigoTramite: this.codigoTramite,
                Dominio: this.dominio,
                CodigoVehiculo: this.codigoVehiculo,
                EsMandatario: this.esMandatario ? this.esMandatario : false,
                MandatarioCertificaFirma: this.mandatarioCertificaFirma ? this.mandatarioCertificaFirma : 0,
                MandatarioRequiereF13I: this.mandatarioRequiereF13I ? this.mandatarioRequiereF13I : 0,
                MandatarioNombre: this.mandatarioNombre,
                MandatarioApellido: this.mandatarioApellido,
                MandatarioCuit: this.mandatarioCuit,
                MandatarioEmail: this.mandatarioEmail,
                EsEscribano: this.esEscribano ? this.esEscribano : false,
                EscribanoMatricula: this.escribanoMatricula,
                EscribanoNombre: this.escribanoNombre,
                EscribanoApellido: this.escribanoApellido,
                EscribanoCuit: this.escribanoCuit,
                EscribanoEmail: this.escribanoEmail,
                CodigoRegistroSeccional: (this.codigoTramite === '570300' || this.codigoTramite === '570302' ? 2001 : this.codigoRegistroSeccional),
                Fecha: this.fecha,
                Hora: this.hora
            };
        }
    };
};

var Turno = function () {
    return {
        fecha: '',
        hora: ''
    };
};

var Solicitante = function () {
    return {
        buscado: false,
        idTipoCaracterSolicitante: null,
        tipoDocumento: '',
        numeroDocumento: '',
        apellido: '',
        nombre: '',
        cuit: '',
        razonSocial: '',
        esValido: false,
        esMandatario: false,
        email: '',
        repitaEmail: '',
        codigoArea: null,
        telefono: null,
        codigoAreaCelular: null,
        telefonoCelular: null,
        operadorCelular: null,
        nroMatriculaMandatario: ''
    };
};

var Pago = function () {
    return {
        formaPago: '',
        medioPago: '',
        medioPagoNombre: '',
        tipoDocumento: '',
        numeroDocumento: '',
        codigoBanco: '',
        nombreBanco: '',
        codigoRed: '',
        nombreRed: '',
        montoPresupuesto: '',
        email: '',
    };
};

var Tramite = function () {
    return {
        numeroTramite: null,
        numeroRecibo: '',
        codigoVerificador: '',
        observacion: ''
    };
};


var Precarga = function () {
    return {
        titular: null,
        motivo: '',
        solicitarExpediciones: null,
        cedulasTitulares: null,
        cedulasAutorizados: null,
        comprador: null,
        //certificadoInscripcionPartida: null,
        certificadoInscripcionNumero: null,
        //certificadoInscripcionAnio: null,
        certificadoMarcaCodigo: null,
        certificadoModeloCodigo: null,
        certificadoTipoAutomotorCodigo: null,
        certificadoModeloAnio: null,
        certificadoProcedencia: null,
        certificadoFabricaCodigo: null,
        certificadoCilindrada: null,
        certificadoIdRegimen: null,
        numeroChasis: null,
        idTramitePosteriorPrendaNumero: null,
        certificadoPrendaNumero: null,
        valorDeclarado: null,
        valorPesos: null,
        valorPrenda: null,
        prendaCondicionada: null,
        dominioPrecargaRelacionada: null,
        numeroPrecargaRelacionada: null,
        denunciaCompra: null
    };
};

var Titular = function () {
    return {
        apellido: null,
        nombre: null,
        tipoPersona: null,
        tipoDocumento: null,
        numeroDocumento: null,
        cuitCuil: null,
        cuit: null,
        razonSocial: null
    };
};

var Comprador = function () {
    return {
        fechaEntrega: null,
        lugar: null,
        codigoPersona: null,
        tipoDocumento: null,
        numeroDocumento: null,
        apellido: null,
        nombre: null,
        cuit: null,
        razonSocial: null,
        cargarDomicilio: null,
        provincia: null,
        partido: null,
        localidad: null,
        codigoPostal: null,
        barrio: null,
        calle: null,
        numero: null,
        piso: null,
        departamento: null
    };
};

var Transferencia = function () {
    return {
        compradores: null,
        vendedores: null
    };
};

var Cedula = function () {
    return {
        tipoPersona: null,
        tipoDocumento: null,
        numeroDocumento: null,
        cuit: null,
        apellido: null,
        nombre: null
    }
};

//var Vehiculo = function () {
//    return {
//        dominio: '',
//        codigoVehiculo: '',
//        marca: '',
//        modelo: '',
//        anio: ''
//    };
//};
//var TipoTramite = function () {
//    return {
//        codigoTramite: null,
//        nombreTramite: null,
//        requiereDominio: null,
//        excluyeDominio: null,
//        implementado: null,
//        conPresupuesto: null,
//        precargaDesarrollada: null,
//        requiereTitular: null
//    };
//};
//var Registro = function () {
//    return {
//        codigoRegistroSeccional: null,
//        denominacion: '',
//        registroLocalidad: '',
//        registroProvincia: ''
//    };
//};
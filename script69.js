var Tramite08 = function () {
    return {
        NumeroPrecarga: 0,
        CodigoRegistro: 0,
        CodigoRegistroDestino: 0,
        Dominio: '',
        Chasis: '',
        Vehiculo: '',
        CodigoTramite: '',
        Vendedores: [],
        Compradores: [],
        Gravamenes: [],
        Cedulas: [],
        Marca: '',
        Modelo: '',
        Tipo: '',
        Anio: '',
        Procedencia: '',
        Certificado: '',
        Certificado08: '',
        Certificado04: '',
        PrecioCompra: '',
        Concepto: '',
        Uso: '',
        AmbasPartes: false,
        ConPrenda: false,
        esMandatario: false,
        
        nroMatriculaMandatario: '',
        cuitMandatario: '',
        emailMandatario: '',
        nombreMandatario: '',
        ApellidoMandatario: '',
        codigoEmail: '',
        origenSite: '',
        //escribanos
        esEscribano: false,
        escribanoNombre: '',
        escribanoApellido: '',
        escribanoMatricula: '',
        escribanoCuit: '',
        escribanoEmail: '',
        //end escribano
         mostrarDetalle: false
    };
};

var PersonaFisica = function () {
    return {
        Tipo: '',
        PorcentajeBien: 0,
        Apellido: '',
        Nombre: '',
        RazonSocial: '',
        TipoDocumento: '',
        NroDocumento: '',
        CuitCuil: '',
        EstadoCivil: '',
        CaracterBien: '',
        NroInscripcion: '',
        ProvinciaInscripcion: '',
        ProvinciaLegal: '',
        PartidoLegal: '',
        LocalidadLegal: '',
        CalleLegal: '',
        NroLegal: '',
        PisoLegal: '',
        DptoLegal: '',
        CPLegal: '',
        ProvinciaReal: '',
        PartidoReal: '',
        LocalidadReal: '',
        CalleReal: '',
        NroReal: '',
        PisoReal: '',
        DptoReal: '',
        CPReal: '',
        Conyuge: new ConyugeVendedor(),
        Apoderados: [],
        Firmantes: [],
        Contacto: new ContactoVendedor(),
        FullName: '',
        FechaNac: '',
        Nacionalidad: ''
    };
};

var Domicilio = function () {
    return {
        Tipo: '',
        Provincia: '',
        Localidad: '',
        Partido: '',
        Calle: '',
        Nro: '',
        Piso: '',
        Dpto: '',
        CodigoPostal: ''
    };
}

var ConyugeVendedor = function () {
    return {
        Apellido: '',
        Nombre: '',
        TipoDocumento: '',
        NroDocumento: '',
        Apoderados: []
    };
};

var ApoderadoVendedor = function () {
    return {
        Rol: '',
        Apellido: '',
        Nombre: '',
        CuitCuil: '',
        Representado: '',
        Firmante: false
    };
};

var ContactoVendedor = function () {
    return {
        Email: '',
        RepetirEmail: '',
        Telefono: '',
        Validado: 0
    };
};

var Gravamen = function () {
    return {
        FechaInscripcion: '',
        Monto: 0,
        CausaAcreedor: ''
    }
}

var Cedula = function () {
    return {
        TipoCedula: '',
        AutorizanteIndex: 0,
        TipoDocumento: '',
        NroDocumento: 0,
        Apellido: '',
        Nombre: ''
    }
}

var Turno = function () {
    return {
        fecha: '',
        hora: ''
    };
};
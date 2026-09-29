angular
    .module('webApp')
    .controller('identificarDominioController', ['$scope', '$location', '$window', 'session', 'TipoTramite', 'VehiculoServices', 'SITE', 'digitales', identificarDominioController]);

function identificarDominioController($scope, $location, $window, session, TipoTramite, VehiculoServices, SITE, digitales) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, 'Buscá la patente del vehículo para conocer en qué registro está radicado');

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    } else {
        vm.solicitud.clearVehiculo();
        vm.mostrarChasis = true;
        if (vm.solicitud.operacion === 2) {
            vm.mostrarChasis = false;
        }
        if (vm.solicitud.operacion === 10) {
            vm.mostrarChasis = false;
        }
        vm.solicitud.registro = null;
        
    }

    vm.validarVehiculo = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            recaptchaCallback = function (token) {
                VehiculoServices.obtenerVehiculo(
                    {
                        Dominio: vm.dominio,
                        Chasis: vm.chasis,
                        CodigoTramite: vm.solicitud.codigoTramite,
                        ObtenerTurnosDelRegistro: vm.solicitud.operacion === OperacionEnum.Turno && !vm.solicitud.conPresupuesto,
                        ObtenerTiposTramitesTipoDespachoRecibirEmail: vm.solicitud.operacion === OperacionEnum.InformeWeb,
                        EsMandatario: vm.solicitud.esMandatario || false,
                        RecaptchaResponse: token
                    },
                    function (data) {
                        grecaptcha.reset();
                        vm.esValido = true;
                        vm.dominio = data.dominio;
                        vm.dominioValido = data.dominio;
                        vm.codigoVehiculo = data.codigoVehiculo;
                        vm.esPlacaMercosur = data.esPlacaMercosur;
                        vm.marca = data.marca;
                        vm.modelo = data.modelo;
                        vm.anio = data.anio;

                        //vm.registro = new Registro();
                        vm.codigoRegistroSeccional = data.codigoRegistroSeccional;
                        vm.registroDenominacion = data.registroDenominacion;
                        vm.registroDireccion = data.registroDireccion;
                        vm.registroLocalidad = data.registroLocalidad;
                        vm.registroProvincia = data.registroProvincia;

                        if (data.tiposTramites) {
                            vm.solicitud.tiposTramites = data.tiposTramites;
                        }

                        if (data.turnos) {
                            vm.solicitud.turnoToday = data.turnos.hoy;
                            vm.solicitud.turnoStart = data.turnos.inicio;
                            vm.solicitud.turnoEnd = data.turnos.fin;
                            vm.solicitud.turnoDiasnolaborables = data.turnos.diasNoLaborables;
                            vm.solicitud.dias = data.turnos.dias;
                        }
                    },
                    function () {
                        vm.esValido = false;
                        grecaptcha.reset();
                    });
            };
            grecaptcha.execute();
        }
    };

    vm.obtenerLargoChasis = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            recaptchaCallback = function (token) {
                VehiculoServices.obtenerLargoChasis(
                    {
                        Dominio: vm.dominio,
                        CodigoTramite: vm.solicitud.codigoTramite,
                        RecaptchaResponse: token
                    },
                    function (data) {
                        grecaptcha.reset();
                        vm.mostrarChasis = data.mostrarChasis;
                        vm.mensajeChasis = data.mensajeChasis;

                        if (!data.mostrarChasis) 
                        {

                            VehiculoServices.obtenerVehiculo(
                                {
                                    Dominio: vm.dominio,
                                    Chasis: vm.chasis,
                                    CodigoTramite: vm.solicitud.codigoTramite,
                                    ObtenerTurnosDelRegistro: vm.solicitud.operacion === OperacionEnum.Turno && !vm.solicitud.conPresupuesto,
                                    ObtenerTiposTramitesTipoDespachoRecibirEmail: vm.solicitud.operacion === OperacionEnum.InformeWeb,
                                    EsMandatario: vm.solicitud.esMandatario || false,
                                    RecaptchaResponse: token
                                },
                                function (data) {
                                    grecaptcha.reset();
                                    vm.esValido = true;

                                    vm.dominio = data.dominio;
                                    vm.dominioValido = data.dominio;
                                    vm.codigoVehiculo = data.codigoVehiculo;
                                    vm.esPlacaMercosur = data.esPlacaMercosur;
                                    vm.marca = data.marca;
                                    vm.modelo = data.modelo;
                                    vm.anio = data.anio;

                                    //vm.registro = new Registro();
                                    vm.codigoRegistroSeccional = data.codigoRegistroSeccional;
                                    vm.registroDenominacion = data.registroDenominacion;
                                    vm.registroDireccion = data.registroDireccion;
                                    vm.registroLocalidad = data.registroLocalidad;
                                    vm.registroProvincia = data.registroProvincia;

                                    if (data.tiposTramites) {
                                        vm.solicitud.tiposTramites = data.tiposTramites;
                                    }

                                    if (data.turnos) {
                                        vm.solicitud.turnoToday = data.turnos.hoy;
                                        vm.solicitud.turnoStart = data.turnos.inicio;
                                        vm.solicitud.turnoEnd = data.turnos.fin;
                                        vm.solicitud.turnoDiasnolaborables = data.turnos.diasNoLaborables;
                                        vm.solicitud.dias = data.turnos.dias;
                                    }
                                },
                                function () {
                                    vm.esValido = false;
                                    grecaptcha.reset();
                                });

                        }

                    },
                    function () {
                        vm.esValido = false;
                        grecaptcha.reset();
                    });
            };
            grecaptcha.execute();
        }
    };

    vm.submit = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            //vm.solicitud.vehiculo = angular.copy(vm.vehiculo);
            //vm.solicitud.vehiculo = new Vehiculo();
            vm.solicitud.dominio = vm.dominioValido;
            vm.solicitud.codigoVehiculo = vm.codigoVehiculo;
            vm.solicitud.esPlacaMercosur = vm.esPlacaMercosur;
            vm.solicitud.marca = vm.marca;
            vm.solicitud.modelo = vm.modelo;
            vm.solicitud.anio = vm.anio;

            //vm.solicitud.registro = angular.copy(vm.registro);
            //vm.solicitud.registro = new Registro();
            vm.solicitud.codigoRegistroSeccional = vm.codigoRegistroSeccional;
            vm.solicitud.registroDenominacion = vm.registroDenominacion;
            vm.solicitud.registroDireccion = vm.registroDireccion;
            vm.solicitud.registroLocalidad = vm.registroLocalidad;
            vm.solicitud.registroProvincia = vm.registroProvincia;

            if (vm.solicitud.codigoTramite === "090005") {
                $location.path('/seleccionarRegistro');
                return;
            }

            //ASOCIASIONES PROFESIONALES
            if (vm.solicitud.operacion === OperacionEnum.AsociacionesProfesionales) {
                if (vm.solicitud.precargaDesarrollada) {
                    $location.path('/precarga');
                    return;
                }
                if (vm.solicitud.conPresupuesto) {
                    vm.obtenerPresupuesto(0, 0);
                    return;
                }
                alert('ERROR NO HAY PASO!!!');
                return;
            }

            //INFORME WEB
            if (vm.solicitud.operacion === OperacionEnum.InformeWeb) {
                $location.path('/seleccionarTramite');
                return;
            }
            //TURNO
            if (vm.solicitud.operacion === OperacionEnum.Turno || vm.solicitud.operacion === OperacionEnum.TramiteDigital) {
                //FIX:REPOSICIÓN DE PLACA METALICA
                if (vm.solicitud.codigoTramite === "022023" && vm.solicitud.esPlacaMercosur) {
                    vm.solicitud.codigoTramite = "022047";
                }
                
                //END-FIX:REPOSICIÓN DE PLACA METALICA
                if (digitales.esUnTramiteDigital(vm.solicitud.codigoTramite)
                    && vm.solicitud.precargaDesarrollada) {
                    $location.path('/acreedorprendario');
                    return;
                }
                $location.path('/solicitante');
                return;
            }
        }
    };

    vm.obtenerPresupuesto = function (cantidadCedulasTitulares, cantidadCedulasAutorizados) {
        recaptchaCallback = function (token) {
            SITE.obtenerPresupuestoYMediosDePago(
                {
                    RecaptchaResponse: token,
                    Operacion: vm.solicitud.operacion,
                    IdTipoCaracterSolicitante: vm.solicitud.solicitante.idTipoCaracterSolicitante,
                    Dominio: vm.solicitud.dominio,
                    CodigoRegistro: vm.solicitud.codigoRegistroSeccional,
                    CodigoTramite: vm.solicitud.codigoTramite,
                    CodigoVehiculo: vm.solicitud.codigoVehiculo,
                    CantidadCedulasTitulares: cantidadCedulasTitulares,
                    CantidadCedulasAutorizados: cantidadCedulasAutorizados,
                    Precarga: vm.solicitud.armarObjetoParaPost().Precarga,
                    EsMandatario: vm.solicitud.esMandatario ? vm.solicitud.esMandatario : false,
                    MandatarioCertificaFirma: vm.solicitud.mandatarioCertificaFirma ? vm.solicitud.mandatarioCertificaFirma : 0,
                    MandatarioRequiereF13I: vm.solicitud.mandatarioRequiereF13I ? vm.solicitud.mandatarioRequiereF13I : 0
                },
                function (data) {
                    
                    grecaptcha.reset();
                    vm.solicitud.bancos = data.Bancos;
                    vm.solicitud.redes = data.Redes;
                    vm.solicitud.presupuesto = data.Presupuesto;
                    vm.solicitud.registroVEPHabilitado = data.RegistroVEPHabilitado;
                    vm.solicitud.registroPagoMisCuentasHabilitado = data.RegistroPagoMisCuentasHabilitado;
                    vm.solicitud.registroTurnoPagoHabilitado = data.RegistroTurnoPagoHabilitado;
                    vm.solicitud.medioDePagoNombre = data.MedioDePagoNombre;
                    vm.solicitud.medioDePagoDescripcion = data.MedioDePagoDescripcion;
                    vm.solicitud.medioDePagoDescripcionDetallada = data.MedioDePagoDescripcionDetallada;

                    if (data.Certificado) {
                        vm.solicitud.vehiculoMarca = data.Certificado.Marca;
                        vm.solicitud.vehiculoModelo = data.Certificado.Modelo;
                        vm.solicitud.vehiculoTipo = data.Certificado.Tipo;
                        vm.solicitud.vehiculoAnio = data.Certificado.Anio;
                        vm.solicitud.vehiculoOrigen = data.Certificado.Origen;
                        vm.solicitud.vehiculoValorTabla = data.Certificado.ValorTabla;
                    }

                    $location.path('/pago');
                    return;
                },
                function () {
                    
                    grecaptcha.reset();
                });
        };
        grecaptcha.execute();
    };

    vm.volver = function () {
        if (vm.solicitud.operacion === OperacionEnum.InformeWeb || vm.solicitud.operacion === OperacionEnum.Turno) {
            $location.path('/solicitante');
            return;
        }

        //SI NO HAY OPERACION VOY AL INICIO
        $location.path('/');
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}
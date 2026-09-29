angular
    .module('webApp')
    .controller('seleccionarRegistroFirmaDigitalController', ['$scope', '$location', '$window', '$routeParams', 'session', 'Registro', 'SITE', seleccionarRegistroFirmaDigitalController]);

function seleccionarRegistroFirmaDigitalController($scope, $location, $window, $routeParams, session, Registro, SITE) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, null);

    vm.gestionarTurnoRegistroFirmaDigital = function () {
        var solicitud = $routeParams.solicitud;

        if (typeof (solicitud) === "undefined" || solicitud !== "externo") {
            return;
        }

        iniciarGestionarTurnoRegistroFirmaDigital($scope, session);

        vm.solicitud = session.get(0);

        vm.solicitud.esMandatario = false;
        vm.solicitud.codigoTramite = '999996';

        vm.solicitud.nombreTramite = 'REGISTRO DE FIRMA DIGITAL';
        vm.solicitud.requiereDominio = false;
        vm.solicitud.excluyeDominio = false;
        vm.solicitud.implementado = true;
        vm.solicitud.conPresupuesto = false;
        vm.solicitud.precargaDesarrollada = false;
        vm.solicitud.requiereTitular = false;
    };

    vm.gestionarTurnoRegistroFirmaDigital();

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    } else {
        vm.provincias = provincias;
        vm.solicitud.registro = null;
    }

    vm.submit = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            vm.solicitud.codigoVehiculo = vm.vehiculo;
            vm.solicitud.codigoRegistroSeccional = vm.codigoRegistroSeccional;
            vm.solicitud.registroDenominacion = vm.registroDenominacion;
            vm.solicitud.registroDireccion = vm.registroDireccion;
            vm.solicitud.registroLocalidad = vm.registroLocalidad;
            vm.solicitud.registroProvincia = vm.registroProvincia;
            vm.solicitud.registroTelefono = vm.registroTelefono;
            vm.solicitud.registroHorario = vm.registroHorario;

            //TURNO
            if (vm.solicitud.operacion === OperacionEnum.Turno) {
                if (!vm.solicitud.conPresupuesto) {
                    recaptchaCallback = function (token) {
                        SITE.obtenerTurnos(
                            {
                                CodigoRegistroSeccional: vm.codigoRegistroSeccional,
                                CodigoTramite: vm.solicitud.codigoTramite,
                                RecaptchaResponse: token,
                                EsMandatario: vm.solicitud.esMandatario
                            },
                            function (data) {
                                grecaptcha.reset();

                                vm.solicitud.turnoToday = data.hoy;
                                vm.solicitud.turnoStart = data.inicio;
                                vm.solicitud.turnoEnd = data.fin;
                                vm.solicitud.turnoDiasnolaborables = data.diasNoLaborables;
                                vm.solicitud.dias = data.dias;

                                $location.path('/solicitante');
                                return;
                            },
                            function () {
                                grecaptcha.reset();
                            });
                    };
                    grecaptcha.execute();
                } else {
                    if (vm.solicitud.codigoTramite === "010999") {
                        $location.path('/concesionario');
                        return;
                    }

                    $location.path('/solicitante');
                }
            }

            if (vm.solicitud.operacion === OperacionEnum.InformeWeb) {
                recaptchaCallback = function (token) {
                    SITE.obtenerPresupuestoYMediosDePago(
                        {
                            RecaptchaResponse: token,
                            Operacion: vm.solicitud.operacion,
                            IdTipoCaracterSolicitante: vm.solicitud.solicitante.idTipoCaracterSolicitante,
                            Dominio: vm.solicitud.dominio,
                            CodigoRegistro: vm.solicitud.codigoRegistroSeccional,
                            CodigoTramite: vm.solicitud.codigoTramite,
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

                            $location.path('/pago');
                            return;
                        },
                        function () {
                            grecaptcha.reset();
                        });
                };
                grecaptcha.execute();
                return;
            }

        }
    };

    vm.volver = function () {
        if (vm.solicitud.operacion === OperacionEnum.InformeWeb || vm.solicitud.operacion === OperacionEnum.Turno) {
            $location.path('/solicitante');
            return;
        }
        //SI NO HAY OPERACION VOY AL INICIO
        $location.path('/');
    };

    vm.codigoProvinciaChanged = function ($item, $model) {
        vm.codigoRegistroSeccional = null;
        vm.registros = null;
        recaptchaCallback = function (token) {
            vm.formErrors = [];
            Registro.obtenerRegistrosHabilitadoFirmaDigital(
                {
                    CodigoProvincia: vm.codigoProvincia,
                    RecaptchaResponse: token
                },
                function (data) {
                    grecaptcha.reset();
                    vm.registros = data;
                },
                function () {
                    grecaptcha.reset();
                });
        };
        grecaptcha.execute();
    };

    vm.codigoRegistroChanged = function ($item, $model) {
        vm.codigoRegistroSeccional = $item.Key;
        recaptchaCallback = function (token) {
            vm.formErrors = [];
            Registro.obtenerRegistro(
                {
                    CodigoRegistro: vm.codigoRegistroSeccional,
                    RecaptchaResponse: token
                },
                function (data) {
                    grecaptcha.reset();
                    //vm.registro = new Registro();
                    vm.codigoRegistroSeccional = data.CodigoRegistroSeccional;
                    vm.registroCodigo = data.CodigoRegistroSeccional;
                    vm.registroDenominacion = data.Denominacion;
                    vm.registroDireccion = data.Direccion;
                    vm.registroLocalidad = data.Localidad;
                    vm.registroTelefono = data.Telefono;
                    vm.registroHorario = data.Horario;
                },
                function () {
                    grecaptcha.reset();
                });
        };
        grecaptcha.execute();
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}
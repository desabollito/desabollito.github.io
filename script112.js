angular
    .module('webApp')
    .controller('seleccionarRegistroController', ['$scope', '$location', '$window', 'session', 'Registro', 'SITE', seleccionarRegistroController]);

function seleccionarRegistroController($scope, $location, $window, session, Registro, SITE) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, null);

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    } else {

        if (vm.solicitud.codigoTramite === "090005") {
            vm.provincias = [{ "Key": "B", "Value": "BUENOS AIRES" },
                { "Key": "C", "Value": "CIUDAD AUTONOMA DE BUENOS AIRES" }];
        } else {
            vm.provincias = provincias;
        }

        vm.solicitud.vehiculo = null;
        vm.solicitud.registro = null;

        if (vm.solicitud.codigoRegistroSeccional === null) {
            if (vm.solicitud.vehiculos.indexOf('A') >= 0) {
                vm.esAuto = true;
            }
            if (vm.solicitud.vehiculos.indexOf('M') >= 0) {
                vm.esMoto = true;
            }
            if (vm.solicitud.vehiculos.indexOf('Q') >= 0) {
                vm.esMavi = true;
            }
        } else {
            if (vm.solicitud.codigoRegistroSeccional < 25000) {
                vm.esAuto = true;
            } else if (vm.solicitud.codigoRegistroSeccional >= 25000 && vm.solicitud.codigoRegistroSeccional < 50000) {
                vm.esMoto = true;
            } else {
                vm.esMavi = true;
            }
        }

        if (vm.solicitud.codigoTramite) {
            switch (vm.solicitud.codigoTramite) {
                case "010000"://010000	- INSCRIPCION INICIAL DE CERO KILOMETRO NACIONAL (AUTOMOTOR)
                    vm.vehiculoFijo = true;
                    vm.vehiculo = vm.solicitud.vehiculos;
                    break;
                case "010103"://010103	- INSCRIPCION INICIAL DE CERO KILOMETRO IMPORTADO (AUTOMOTOR)
                    vm.vehiculoFijo = true;
                    vm.vehiculo = vm.solicitud.vehiculos;
                    break;
                case "010105"://010105	- INSCRIPCION INICIAL DE CERO KILOMETRO NACIONAL (MOTOVEHICULO)
                case "010205"://010205	- INSCRIPCION INICIAL DE CERO KILOMETRO IMPORTADO (MOTOVEHICULO)
                case "010207"://010205	- Inscripción Motos No Registradas
                    vm.vehiculoFijo = true;
                    vm.vehiculo = 'M';
                    break;
                case "010208"://010205	- Inscripción Motos No Registradas
                    vm.vehiculoFijo = true;
                    vm.vehiculo = 'A';
                    break;
                case "010998"://010998	- INSCRIPCION INICIAL DE CERO KILOMETRO
                case "010999"://010999	- INSCRIPCION INICIAL DE CERO KILOMETRO CON PRENDA
                    vm.vehiculoFijo = true;
                    vm.vehiculo = vm.solicitud.vehiculos;
                    break;
                case "022049"://022049	- INFORME DE MULTAS POR INFRACCIONES DE TRÁNSITO
                    vm.vehiculoFijo = true;
                    vm.vehiculo = vm.solicitud.codigoVehiculo;
                    break;
                default:
                    vm.vehiculo = null;
            }
        }
    }

    vm.submit = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            vm.solicitud.codigoVehiculo = vm.vehiculo;
            //vm.solicitud.registro = angular.copy(vm.registro);
            //vm.solicitud.registro = new Registro();

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
                    //if (vm.solicitud.codigoTramite === "010999") {
                    //    $location.path('/concesionario');
                    //    return;
                    //}
                    
                    //SE REQUIERE PARA TODOS LOS TRAMITES RELACIONADOS CON PRENDA QUE EL SOLICITANTE SEA UN ACREEDOR PRENDARIO EXCEPTUANDO LA CANCELACION DE PRENDA 
                    if (vm.solicitud.codigoTramite === "010999" //INCRIPCION INICIAL CON PRENDA DIGITAL 
                        || vm.solicitud.codigoTramite === "022009" //ENDOSO"
                        || vm.solicitud.codigoTramite === "022010"  //CANCELACION ENDOSO
                        || vm.solicitud.codigoTramite === "022014"  //MODIFICACION PRENDA
                        || vm.solicitud.codigoTramite === "030000"  //PRENDA USADO"
                    )
                    {
                        $location.path('/acreedorprendario');
                        return;
                    }
                    if (vm.solicitud.codigoTramite === '040703') {
                        $location.path('/pago');
                    }
                    else {
                        $location.path('/solicitante');
                    }

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

    $scope.$watch('seleccionarRegistroCtrl.vehiculo', function (newVal, oldVal) {
        if (vm.vehiculo && vm.codigoProvincia) {
            vm.codigoRegistroSeccional = null;
            recaptchaCallback = function (token) {
                vm.formErrors = [];
                Registro.obtenerRegistrosPorProvincia(
                    {
                        CodigoProvincia: vm.codigoProvincia,
                        Vehiculo: vm.vehiculo,
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
        }
    });

    vm.codigoProvinciaChanged = function ($item, $model) {
        vm.codigoRegistroSeccional = null;
        recaptchaCallback = function (token) {
            vm.formErrors = [];
            Registro.obtenerRegistrosPorProvincia(
                {
                    CodigoProvincia: vm.codigoProvincia,
                    Vehiculo: vm.vehiculo,
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
        // Validación: No permitir registro 2999 para trámite 022049 en provincia C
        if (vm.codigoProvincia === "C" && 
            vm.solicitud.codigoTramite === "022049" && 
            $item.Key === 2993) {
            
            // Mostrar error al usuario (compatible con ng-bind-html en el template)
            //vm.formErrors = ["El Registro Desarmadero no está disponible para Informe de Multas en Ciudad Autónoma de Buenos Aires. Por favor, seleccione otro registro."];
            vm.formErrors = ["El Registro Desarmadero no está disponible para el cobro del trámite: \"Informe de multas e infracciones de tránsito\". Por favor, seleccione otro registro."];
            // Limpiar todas las variables relacionadas
            vm.codigoRegistroSeccional = null;
            vm.registroCodigo = null;
            vm.registroDenominacion = null;
            vm.registroDireccion = null;
            vm.registroLocalidad = null;
            vm.registroTelefono = null;
            vm.registroHorario = null;
            
            // Scroll hacia arriba para que el usuario vea el error
            $window.scrollTo(0, 0);
            
            // Retornar para prevenir la ejecución del resto del código
            return false;
        }
        
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
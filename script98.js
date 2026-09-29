angular
    .module('webApp')
    .controller('solicitanteController', ['$scope', '$location', '$window', 'session', '$http', 'Afip', 'appConfig', 'popupService', 'SITE', solicitanteController]);

function solicitanteController($scope, $location, $window, session, $http, Afip, appConfig, popupService, SITE) {
    $window.scrollTo(0, 0);

    var vm = this;

    setSubtitulo($scope, 'Completá los datos personales y de contacto del solicitante.');

    vm.crearNuevoSolicitante = function () {
        vm.solicitud.solicitante = null;
        vm.solicitante = new Solicitante();
        vm.solicitante.tipoDocumento = '8';

        //SOLICITANTE LETRADO
        switch (vm.solicitud.codigoTramite) {
            case '020101':
            case '020102':
            case '020103':
            case '020204':
            case '020300':
            case '020301':
            case '020302':
            case '020400':
            case '022004':
            case '022010':
            case '022021':
            case '022045':
                vm.solicitante.esLetrado = true;
                vm.solicitante.idTipoCaracterSolicitante = '';
                break;
            default:
                vm.solicitante.esLetrado = false;
                vm.solicitante.idTipoCaracterSolicitante = '1';
        }
        //FIN:SOLICITANTE LETRADO
    };

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    } else {
        vm.crearNuevoSolicitante();

        //TEST
        //vm.solicitante.nombre = 'ezequiel';
        //vm.solicitante.apellido = 'la rosa';
        //vm.solicitante.numeroDocumento = 20297189221;
        //vm.solicitante.email = 'elarosa@jus.gov.ar';
        //vm.solicitante.repitaEmail = 'elarosa@jus.gov.ar';
        //vm.solicitante.codigoAreaCelular = 11;
        //vm.solicitante.telefonoCelular = 34453445;
        //vm.solicitante.operadorCelular = 'P';
        //FIN:TEST

    }

    vm.confirmar = function () {
        if (vm.solicitante.numeroDocumento !== '') {
            vm.formErrors = [];
            SITE.obtenerSolicitante({
                cuit: vm.solicitante.numeroDocumento,
                mandatario: vm.solicitud.esMandatario,
                operacion: vm.solicitud.codigoTramite === '999996' ? 2 : vm.solicitud.operacion
            },
                function (response) {
                    vm.esValido = true;
                    vm.solicitante.numeroDocumentoBuscado = vm.solicitante.numeroDocumento;
                    vm.solicitante.nombre = response.data.Nombre;
                    vm.solicitante.apellido = response.data.Apellido;
                    vm.solicitante.email = response.data.Email;
                    vm.solicitante.repitaEmail = response.data.Email;
                    vm.solicitante.celular = response.data.Celular;
                    vm.solicitante.buscado = true;
                },
                function (response) {
                    if (vm.solicitud.esMandatario) {
                        vm.esValido = true;
                    }
                    else {
                        var msg = response.data.ModelState[""][0];
                        if (msg.toString().indexOf("mandatario")>=0) {
                            vm.esValido = false;
                        } else {
                            vm.esValido = true;
                        }
                    }
                    vm.solicitante.numeroDocumentoBuscado = '';
                    vm.solicitante.nombre = '';
                    vm.solicitante.apellido = '';
                    vm.solicitante.email = '';
                    vm.solicitante.repitaEmail = '';
                    vm.solicitante.celular = '';
                    vm.solicitante.buscado = false;
                }
            );
        }
    };

    vm.modificarDatos = function () {
        vm.solicitante.numeroDocumentoBuscado = '';
        vm.solicitante.nombre = '';
        vm.solicitante.apellido = '';
        vm.solicitante.email = '';
        vm.solicitante.repitaEmail = '';
        vm.solicitante.celular = '';
        vm.solicitante.buscado = false;
        return;
    };

    //vm.validarPersona = function () {
    //    $scope.$broadcast('show-errors-check-validity', 'form');
    //    if (vm.form.$valid) {
    //        recaptchaCallback = function(token) {
    //    Afip.ValidarPersona({
    //        tipoDocumento: vm.solicitante.tipoDocumento,
    //        numeroDocumento: vm.solicitante.numeroDocumento,
    //        RecaptchaResponse: token
    //    },
    //        function (data) {
    //            grecaptcha.reset();
    //            vm.solicitante.apellido = data.Apellido;
    //            vm.solicitante.nombre = data.Nombre;
    //        },
    //        function () {
    //            grecaptcha.reset();
    //        });
    //};
    //grecaptcha.execute();
    //    }
    //};
    //vm.validarPersonaCliente = function () {
    //    vm.form.numeroDocumento.$setValidity('personaInvalida', true);
    //    $scope.$broadcast('show-errors-check-validity', 'form');
    //    if (vm.form.$valid) {
    //        vm.solicitante.esValido = true;
    //    } else {
    //        vm.solicitante.esValido = false;
    //    }
    //    return;
    //if (vm.form.$valid) {
    //    $.get("https://soa.afip.gob.ar/sr-padron/v1/persona/" + vm.solicitante.numeroDocumento,
    //        function (response, status) {
    //            $scope.$apply(
    //                function () {
    //                    vm.solicitante.apellido = null;
    //                    vm.solicitante.nombre = null;
    //                    vm.form.numeroDocumento.$setValidity('personaInvalida', response.success);
    //                    if (response.success) {
    //                        vm.solicitante.esValido = true;
    //                        vm.solicitante.apellido = response.data.nombre;
    //                        vm.solicitante.nombre = response.data.nombre;
    //                    } else {
    //                        vm.solicitante.esValido = false;
    //                    }
    //                }
    //            );
    //        }).
    //        fail(function (response) {
    //            vm.solicitante.esValido = true;
    //        });
    //}
    //};
    //vm.modificarPersona = function () {
    //    vm.solicitante.esValido = false;
    //};

    vm.submit = function () {
        vm.formErrors = [];
        if (!vm.solicitante.buscado) vm.validarRepitaEmail();
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            if (vm.solicitante.buscado) {
                vm.solicitud.emailValido = true;
                vm.solicitante.numeroDocumento = vm.solicitante.numeroDocumentoBuscado;
            }
            vm.solicitud.solicitante = angular.copy(vm.solicitante);
            //vm.solicitud.solicitante = new Solicitante();
            //vm.solicitud.solicitante.idTipoCaracterSolicitante = vm.solicitante.idTipoCaracterSolicitante;
            //vm.solicitud.solicitante.tipoDocumento = vm.solicitante.tipoDocumento;
            //vm.solicitud.solicitante.numeroDocumento = vm.solicitante.numeroDocumento;
            //vm.solicitud.solicitante.apellido = vm.solicitante.apellido;
            //vm.solicitud.solicitante.nombre = vm.solicitante.nombre;
            //vm.solicitud.solicitante.esValido = vm.solicitante.esValido;
            //vm.solicitud.solicitante.email = vm.solicitante.email;
            //vm.solicitud.solicitante.repitaEmail = vm.solicitante.repitaEmail;
            //vm.solicitud.solicitante.codigoArea = vm.solicitante.codigoArea;
            //vm.solicitud.solicitante.telefono = vm.solicitante.telefono;
            //vm.solicitud.solicitante.codigoAreaCelular = vm.solicitante.codigoAreaCelular;
            //vm.solicitud.solicitante.telefonoCelular = vm.solicitante.telefonoCelular;
            //vm.solicitud.solicitante.operadorCelular = vm.solicitante.operadorCelular;

            if (vm.solicitud.operacion === OperacionEnum.InformeWeb) {
                $location.path('/identificarDominio');
                return;
            }

            if (vm.solicitud.operacion === OperacionEnum.RetirarDocumentacion) {
                $location.path('/seleccionarTurno');
                return;
            }

            if (vm.solicitud.operacion === OperacionEnum.Turno) {
                if (vm.solicitud.precargaDesarrollada) {
                    $location.path('/precarga');
                    return;
                }

                if (vm.solicitud.conPresupuesto) {
                    vm.obtenerPresupuesto(0, 0);
                    return;
                }

                if (!appConfig.solicitarTurno) {
                    recaptchaCallback = function (token) {
                        SITE.finalizar({ Solicitud: vm.solicitud.armarObjetoParaPost(), RecaptchaResponse: token },
                            function (data) {
                                grecaptcha.reset();
                                vm.solicitud.ErrorPago = data.ErrorPago;
                                vm.solicitud.numeroVEP = data.numeroVEP;
                                vm.solicitud.numeroPagoMisCuentas = data.numeroPagoMisCuentas;
                                vm.solicitud.numeroPrecarga = data.NumeroPrecarga;
                                vm.solicitud.codigoParaServicios = data.CodigoParaServicios;
                                vm.solicitud.horasValidez = data.HorasValidez;

                                if (data.ErrorPago) {
                                    $location.path('/pago');
                                    return;
                                } else {
                                    $location.path('/finalizar');
                                }
                            },
                            function () {
                                grecaptcha.reset();
                            });
                    };
                    grecaptcha.execute();
                }
                else
                    $location.path('/seleccionarTurno');
                return;
            }

            $location.path('/');
            return;
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
                    CodigoRegistro: (vm.solicitud.codigoTramite === '570300' ? 2001 : vm.solicitud.codigoRegistroSeccional),
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
        if (vm.solicitud.operacion === OperacionEnum.InformeWeb) {
            $location.path('/');
            return;
        }

        if (vm.solicitud.operacion === OperacionEnum.RetirarDocumentacion) {
            $location.path('/estadoTramite');
            return;
        }

        //SI NO HAY OPERACION VOY AL INICIO
        $location.path('/');
        return;
    };

    vm.validarRepitaEmail = function () {
        vm.form.repitaEmail.$setValidity('repitaEmailInvalido', vm.solicitante.email && vm.solicitante.repitaEmail && vm.solicitante.email.toLowerCase() === vm.solicitante.repitaEmail.toLowerCase());
    };

    vm.repitaEmailChanged = function () {
        vm.validarRepitaEmail();
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}

//angular
//    .module('webApp')
//    .directive('xxx', function () {
//        return {
//            require: 'ngModel',
//            link: function (scope, elm, attrs, ctrl) {

//                ctrl.$validators.xxx = function (modelValue, viewValue) {
//                    if (ctrl.$isEmpty(modelValue)) {
//                        // consider empty models to be valid
//                        return true;
//                    }
//                    return ctrl.$$parentForm.email.$modelValue.toLowerCase() === modelValue.toLowerCase();
//                };
//            }
//        };
//    });
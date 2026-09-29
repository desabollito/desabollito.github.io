angular
    .module('webApp')
    .controller('acreedorPrendarioController', ['$scope', '$location', '$window', 'session', '$http', 'Afip', 'appConfig', 'SITE', acreedorPrendarioController]);

function acreedorPrendarioController($scope, $location, $window, session, $http, Afip, appConfig, SITE) {
    $window.scrollTo(0, 0);
    
    var vm = this;

    setSubtitulo($scope, 'Completá los datos contacto del solicitante (Acreedor Prendario).');

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    } else {
        vm.solicitud.solicitante = null;
        vm.solicitante = new Solicitante();
        vm.solicitante.idTipoCaracterSolicitante = '10';
        vm.solicitante.tipoDocumento = '8';

        //TEST
        //vm.solicitante.numeroDocumento = 30504018845;
        //FIN:TEST

    }

    vm.confirmar = function () {
        
        if (vm.solicitante.numeroDocumento !== '') {
            vm.formErrors = [];
            SITE.obtenerAcreedorPrendario({ cuit: vm.solicitante.numeroDocumento },
                function (response) {
                    vm.esValido = true;
                    vm.solicitante.numeroDocumentoBuscado = vm.solicitante.numeroDocumento;
                    vm.solicitante.apellido = response.data.Apellido;

                    if (response.data.Email) {
                        vm.solicitante.email = response.data.Email;
                        vm.solicitante.repitaEmail = response.data.Email;
                        vm.solicitante.buscado = true;
                    } else {
                        vm.solicitante.buscado = false;
                    }
                },
                function (response) {
                    vm.esValido = false;
                    vm.solicitante.numeroDocumentoBuscado = '';
                    vm.solicitante.apellido = '';
                    vm.solicitante.email = '';
                    vm.solicitante.repitaEmail = '';
                    vm.solicitante.buscado = false;
                }
            );
        }
    };

    vm.modificarDatos = function () {
        vm.solicitante.email = '';
        vm.solicitante.repitaEmail = '';
        vm.solicitante.buscado = false;
        return;
    };

    vm.submit = function () {
        vm.formErrors = [];
        //if (!vm.solicitante.buscado) vm.validarRepitaEmail();
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            if (vm.solicitante.buscado) {
                vm.solicitud.emailValido = true;
                vm.solicitante.numeroDocumento = vm.solicitante.numeroDocumentoBuscado;
            }
            vm.solicitud.solicitante = angular.copy(vm.solicitante);

            if (vm.solicitud.operacion === OperacionEnum.InformeWeb) {
                $location.path('/identificarDominio');
                return;
            }

            if (vm.solicitud.operacion === OperacionEnum.RetirarDocumentacion) {
                $location.path('/seleccionarTurno');
                return;
            }

            if (vm.solicitud.operacion === OperacionEnum.Turno || vm.solicitud.operacion === OperacionEnum.TramiteDigital) {
                if (vm.solicitud.precargaDesarrollada) {
                    $location.path('/precarga');
                    return;
                }
                if (vm.solicitud.conPresupuesto) {
                    $location.path('/pago');
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

    //vm.validarRepitaEmail = function () {
    //    vm.form.repitaEmail.$setValidity('repitaEmailInvalido', vm.solicitante.email && vm.solicitante.repitaEmail && vm.solicitante.email.toLowerCase() === vm.solicitante.repitaEmail.toLowerCase());
    //};

    //vm.repitaEmailChanged = function () {
    //    vm.validarRepitaEmail();
    //};

    registerInterceptorValidationSummary($scope, vm, $window);
}
angular
    .module('webApp')
    .controller('enviarEmailController', ['$scope', '$location', '$window', '$uibModal', 'session', 'SITE', enviarEmailController]);

function enviarEmailController($scope, $location, $window, $uibModal, session, SITE) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, 'Para confirmar la solicitud es necesario validar tu cuenta de email.');

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    }

    vm.volver = function () {
        if (vm.solicitud.operacion === OperacionEnum.InformeWeb) {
            $location.path('/pago');
            return;
        }
        if (vm.solicitud.operacion === OperacionEnum.Turno) {
            $location.path('/seleccionarTurno');
            return;
        }

        //SI NO HAY OPERACION VOY AL INICIO
        $location.path('/');
        return;
    };

    //ENVIAR CODIGO + CAPTCHA
    vm.enviarCodigo = function () {
        //EMAIL VALIDO
        if (vm.solicitud.emailValido) {
            vm.finalizar();
            return;
        }

        //EMAIL NO VALIDO
        recaptchaCallback = function (token) {
            SITE.enviarCodigoEmail({ RecaptchaResponse: token, Email: vm.solicitud.solicitante.email },
                function (data) {
                    grecaptcha.reset();
                    vm.solicitud.codigoEmail = data.codigo;
                    $uibModal.open({
                        animation: true,
                        templateUrl: 'app/modules/solicitudes/modalEmailEnviado.html',
                        controller: ['$scope', '$uibModalInstance', function ($modalscope, $uibModalInstance) {
                            var vmModal = this;
                            vmModal.solicitud = vm.solicitud;
                            vmModal.submit = function () {
                                grecaptcha.reset();
                                vmModal.formErrors = [];
                                vmModal.form.codigo.$setValidity('codigoInvalido', (vmModal.solicitud.codigoEmail && vmModal.codigo && vmModal.solicitud.codigoEmail.toLowerCase() === vmModal.codigo.toLowerCase()));
                                $modalscope.$broadcast('show-errors-check-validity', 'form');
                                if (vmModal.form.$valid) {
                                    $uibModalInstance.dismiss('cancel');
                                    vmModal.solicitud.emailValido = true;
                                    vm.finalizar();
                                }
                            };
                            vmModal.cerrar = function () {
                                $uibModalInstance.dismiss('cancel');
                            };
                            
                        }],
                        controllerAs: 'modalEmailEnviadoCtrl',
                        backdrop: 'static'
                    });
                },
                function () {
                    grecaptcha.reset();
                });
        };
        grecaptcha.execute();
    };

    vm.finalizar = function() {
        recaptchaCallback = function (token) {
            SITE.finalizar({ Solicitud: vm.solicitud.armarObjetoParaPost(), RecaptchaResponse: token },
                function (data) {
                    grecaptcha.reset();
                    vm.solicitud.ErrorTurno = false;
                    vm.solicitud.ErrorPago = false;

                    if (data.ErrorTurno) {
                        vm.solicitud.ErrorTurno = data.ErrorTurno;
                        vm.fecha = null;
                        vm.hora = null;
                        vm.horarios = null;
                        vm.solicitud.fecha = null;
                        vm.solicitud.hora = null;
                        vm.solicitud.turnoToday = data.turnos.hoy;
                        vm.solicitud.turnoStart = data.turnos.inicio;
                        vm.solicitud.turnoEnd = data.turnos.fin;
                        vm.solicitud.turnoDiasnolaborables = data.turnos.diasNoLaborables;
                        vm.solicitud.dias = data.turnos.dias;
                        $window.scrollTo(0, 0);
                        $location.path('/seleccionarTurno');
                        return;
                    }

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
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}
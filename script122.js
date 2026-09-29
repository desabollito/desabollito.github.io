angular
    .module('webApp')
    .controller('indexController', ['$scope', '$location', '$window', '$uibModal', 'session', 'SITE', indexController]);

function indexController($scope, $location, $window, $uibModal, session, SITE) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, 'Para confirmar la solicitud es necesario validar tu cuenta de email.');

    session.clear();

    vm.solicitud = new Solicitud();

    //ENVIAR CODIGO + CAPTCHA
    vm.enviarCodigo = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            //RE CAPTCHA CALLBACK
            recaptchaCallback = function (token) {

                vm.solicitud.solicitante = new Solicitante();
                vm.solicitud.solicitante.esMandatario = true;
                vm.solicitud.solicitante.cuit = vm.cuit;
                vm.solicitud.solicitante.email = vm.email;

                SITE.enviarCodigoEmailMandatario({ RecaptchaResponse: token, Email: vm.solicitud.solicitante.email, Cuit: vm.solicitud.solicitante.cuit },
                    function (data) {
                        grecaptcha.reset();
                        vm.solicitud.codigoEmail = data.codigo;
                        $uibModal.open({
                            animation: true,
                            templateUrl: 'app/modules/mandatario/modalEmailEnviado.html',
                            controller: ['$scope', '$uibModalInstance', function ($modalscope, $uibModalInstance) {
                                var vmModal = this;
                                vmModal.solicitud = vm.solicitud;
                                vmModal.submit = function () {
                                    grecaptcha.reset();
                                    vmModal.formErrors = [];
                                    vmModal.form.codigo.$setValidity('codigoInvalido', vmModal.solicitud.codigoEmail && vmModal.codigo && vmModal.solicitud.codigoEmail.toLowerCase() === vmModal.codigo.toLowerCase());
                                    $modalscope.$broadcast('show-errors-check-validity', 'form');
                                    if (vmModal.form.$valid) {
                                        $uibModalInstance.dismiss('cancel');

                                        vmModal.solicitud.emailValido = true;

                                        //CODIGO 08D MANDATARIOS
                                        vmModal.solicitud.solicitante.nombre = data.nombre;
                                        vmModal.solicitud.solicitante.apellido = data.apellido;
                                        vmModal.solicitud.solicitante.nroMatriculaMandatario = data.nroMatriculaMandatario;
                                        vmModal.solicitud.solicitante.tipoDocumento = data.tipoDocumento;
                                        vmModal.solicitud.solicitante.numeroDocumento = data.numeroDocumento;

                                        var tramite = new Tramite08();
                                        tramite.AmbasPartes = true;
                                        tramite.esMandatario = vm.solicitud.solicitante.esMandatario;
                                        tramite.nroMatriculaMandatario = data.nroMatriculaMandatario;
                                        tramite.cuitMandatario = vm.solicitud.solicitante.cuit;
                                        tramite.emailMandatario = vm.solicitud.solicitante.email;
                                        tramite.nombreMandatario = data.nombre;
                                        tramite.apellidoMandatario = data.apellido;
                                        tramite.mostrarDetalle = true; 
                                        session.add(tramite);
                                        //FIN-CODIGO 08D MANDATARIOS

                                        //CODIGO SITE 2
                                        vmModal.solicitud.clearMandatario();
                                        vmModal.solicitud.esMandatario = true;
                                        vmModal.solicitud.mandatarioNombre = data.nombre;
                                        vmModal.solicitud.mandatarioApellido = data.apellido;
                                        vmModal.solicitud.mandatarioMatricula = data.nroMatriculaMandatario;
                                        vmModal.solicitud.mandatarioTipoDocumento = data.tipoDocumento;
                                        vmModal.solicitud.mandatarioNumeroDocumento = data.numeroDocumento;
                                        vmModal.solicitud.mandatarioCuit = vm.cuit;
                                        vmModal.solicitud.mandatarioEmail = vm.email;
                                        vmModal.mostrarDetalle = true;
                                        //END-CODIGO SITE 2
                                        
                                        session.add(vmModal.solicitud);

                                        $location.path('/mandatarios/tablero');
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
            ////RE CAPTCHA CALLBACK
            grecaptcha.execute();
        }
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}